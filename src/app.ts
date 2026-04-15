import KoaRouter from "@koa/router";
import { createServer } from "http";
import { decorate, injectable } from "inversify";
import Koa from "koa";
import { Controller } from "tsoa";
import { DataSource } from "typeorm";

import { iocContainer } from "./app.container";
import { config, nodeEnv } from "./config";
import { BOOTSTRAP, HttpServer, IBootstrap } from "./core";
import { logger, ModuleLoader, TypeOrmDataSource } from "./core";
import { notFoundMiddleware, RegisterAppMiddlewares } from "./middleware";
import {
  RegisterRoutes,
  RegisterSwagger,
  RegisterSystemRoutes,
} from "./routing";

type Constructor = new (...args: any[]) => any;

// ── DB Retry Config ─────────────────────────────────────────────────

/** Базовая задержка между попытками подключения к БД (ms). */
const DB_BASE_DELAY_MS = 1_000;

/** Максимальная задержка между попытками (ms). */
const DB_MAX_DELAY_MS = 30_000;

/** Интервал логирования при долгом ожидании БД (каждые N попыток). */
const DB_LOG_EVERY_N_ATTEMPTS = 10;

// ── Non-critical bootstrappers ──────────────────────────────────────

/** Bootstrappers, чей сбой НЕ прерывает запуск сервера. */
const NON_CRITICAL_BOOTSTRAPPERS = new Set([
  "SeedBootstrap",
  "AdminBootstrap",
  "SyncCleanupBootstrap",
]);

// ─────────────────────────────────────────────────────────────────────

/**
 * Application lifecycle manager.
 *
 * Порядок запуска (production-ready):
 *
 * 1. HTTP server + health endpoints  → livenessProbe работает
 * 2. Database connection (∞ retry)   → ждём пока БД появится
 * 3. Module loading + DI             → IoC container готов
 * 4. Bootstrappers                   → сервисы инициализированы
 * 5. isReady = true                  → readinessProbe → 200
 *
 * Если БД недоступна — сервер живёт, отвечает на /ping и /ready (503).
 * Когда БД подключается — автоматически завершает инициализацию.
 */
export class App {
  private readonly koa: Koa;
  private httpServer?: HttpServer;
  private _isReady = false;

  /** true когда все bootstrappers завершились и сервер готов к трафику. */
  get isReady(): boolean {
    return this._isReady;
  }

  constructor() {
    this.koa = new Koa();
  }

  async start(RootModule: Constructor): Promise<void> {
    // 1. HTTP server стартует ПЕРВЫМ — /ping и /ready доступны сразу.
    //    Kubernetes видит живой процесс и не убивает его.
    this.registerCoreBindings();
    this.configureHealthRoutes();
    await this.listen();

    // 2. Database — бесконечный retry. Сервер ждёт пока БД появится.
    await this.connectDatabase();

    // 3. Modules + Routes (после DB, потому что используют DataSource)
    this.loadModules(RootModule);
    this.configureMiddleware();
    this.configureAppRoutes();

    // 4. Bootstrappers (с изоляцией ошибок)
    await this.runBootstrappers();

    // 5. Ready — readinessProbe вернёт 200
    this._isReady = true;
    logger.info("Application is ready to accept traffic");
  }

  async stop(): Promise<void> {
    this._isReady = false;

    // Destroy bootstrappers в обратном порядке, с изоляцией ошибок
    try {
      const bootstrappers = iocContainer
        .getAll<IBootstrap>(BOOTSTRAP)
        .reverse();

      for (const bootstrapper of bootstrappers) {
        try {
          await bootstrapper.destroy?.();
        } catch (err) {
          logger.error(
            { err, bootstrapper: bootstrapper.constructor.name },
            "Bootstrapper destroy failed (continuing shutdown)",
          );
        }
      }
    } catch {
      // IoC container may not have bootstrappers if startup failed early
    }

    // Закрываем HTTP сервер
    if (this.httpServer) {
      await new Promise<void>(resolve => {
        this.httpServer!.close(() => resolve());
      });
    }

    // Закрываем БД
    if (TypeOrmDataSource.isInitialized) {
      logger.info("Closing database connection...");
      await TypeOrmDataSource.destroy().catch(err => {
        logger.error({ err }, "Database destroy error");
      });
      logger.info("Database connection closed");
    }
  }

  // ─── Private: Setup ───────────────────────────────────────────────

  private registerCoreBindings(): void {
    decorate(injectable(), Controller);
    this.httpServer = createServer(this.koa.callback());

    iocContainer.bind(DataSource).toConstantValue(TypeOrmDataSource);
    iocContainer.bind<Koa>(Koa).toConstantValue(this.koa);
    iocContainer.bind(HttpServer).toConstantValue(this.httpServer);
  }

  /** Health/readiness routes подключаются ДО всего остального. */
  private configureHealthRoutes(): void {
    const router = new KoaRouter();

    RegisterSystemRoutes(router, TypeOrmDataSource, this);
    this.koa.use(router.routes());
    this.koa.use(router.allowedMethods());
  }

  private loadModules(RootModule: Constructor): void {
    new ModuleLoader(iocContainer).load(RootModule);
  }

  private configureMiddleware(): void {
    RegisterAppMiddlewares(this.koa);
  }

  /** App routes (API, swagger) подключаются ПОСЛЕ modules. */
  private configureAppRoutes(): void {
    const router = new KoaRouter();

    RegisterSwagger(router, "/api-docs");
    RegisterRoutes(router);

    this.koa.use(router.routes());
    this.koa.use(router.allowedMethods());
    this.koa.use(notFoundMiddleware);
  }

  private async runBootstrappers(): Promise<void> {
    for (const bootstrapper of iocContainer.getAll<IBootstrap>(BOOTSTRAP)) {
      const name = bootstrapper.constructor.name;

      try {
        await bootstrapper.initialize();
      } catch (err) {
        if (NON_CRITICAL_BOOTSTRAPPERS.has(name)) {
          logger.warn(
            { err, bootstrapper: name },
            "Non-critical bootstrapper failed (skipping)",
          );
        } else {
          logger.error(
            { err, bootstrapper: name },
            "Critical bootstrapper failed (aborting startup)",
          );
          throw err;
        }
      }
    }
  }

  private listen(): Promise<void> {
    return new Promise(resolve => {
      const { port, host } = config.server;

      this.httpServer!.listen(port, host, () => {
        this.logStartup(host, port);
        resolve();
      });
    });
  }

  // ─── Private: Database ────────────────────────────────────────────

  /**
   * Бесконечный retry подключения к БД с exponential backoff.
   *
   * Сервер НЕ падает если БД недоступна — он ждёт.
   * HTTP endpoints (/ping, /ready=503) работают пока ждём.
   * Когда БД появляется — продолжаем инициализацию.
   *
   * Backoff: 1s → 2s → 4s → 8s → 16s → 30s → 30s → 30s → ...
   */
  private async connectDatabase(): Promise<void> {
    const { host: dbHost, port: dbPort, database } = config.database.postgres;
    let attempt = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;

      try {
        // Логируем каждую первую попытку и далее каждые N попыток
        if (attempt === 1 || attempt % DB_LOG_EVERY_N_ATTEMPTS === 0) {
          logger.info(
            { attempt, db: `${dbHost}:${dbPort}/${database}` },
            "Connecting to database...",
          );
        }

        await TypeOrmDataSource.initialize();

        logger.info(
          { attempt, db: `${dbHost}:${dbPort}/${database}` },
          "Database connection established",
        );

        return;
      } catch (error) {
        // Первые 3 попытки и каждые N — логируем ошибку
        if (attempt <= 3 || attempt % DB_LOG_EVERY_N_ATTEMPTS === 0) {
          logger.error(
            { err: error, attempt },
            "Database connection failed, retrying...",
          );
        }

        const delay = Math.min(
          DB_BASE_DELAY_MS * Math.pow(2, Math.min(attempt - 1, 15)),
          DB_MAX_DELAY_MS,
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private logStartup(hostname: string, port: number): void {
    const { host: dbHost, port: dbPort, database } = config.database.postgres;

    logger.info(
      {
        env: nodeEnv,
        url: `http://${hostname}:${port}`,
        swagger: `http://${hostname}:${port}/api-docs`,
        db: `${dbHost}:${dbPort}/${database}`,
      },
      "Server launched successfully",
    );
  }
}
