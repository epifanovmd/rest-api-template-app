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

export class App {
  private readonly koa: Koa;
  private httpServer?: HttpServer;

  constructor() {
    this.koa = new Koa();
  }

  async start(RootModule: Constructor): Promise<void> {
    await this.initializeDatabase();
    this.registerCoreBindings();
    this.loadModules(RootModule);
    this.configureMiddleware();
    this.configureRoutes();
    await this.runBootstrappers();
    await this.listen();
  }

  async stop(): Promise<void> {
    const bootstrappers = iocContainer.getAll<IBootstrap>(BOOTSTRAP).reverse();

    for (const bootstrapper of bootstrappers) {
      await bootstrapper.destroy?.();
    }

    await new Promise<void>((resolve, reject) => {
      this.httpServer?.close(err => (err ? reject(err) : resolve()));
    });

    if (TypeOrmDataSource.isInitialized) {
      await TypeOrmDataSource.destroy();
    }
  }

  /**
   * Регистрирует примитивы, которые не могут быть частью модуля:
   * DataSource (создан статически), Koa и единый HttpServer.
   * tsoa требует, чтобы базовый класс Controller был injectable.
   */
  private registerCoreBindings(): void {
    decorate(injectable(), Controller);
    this.httpServer = createServer(this.koa.callback());

    iocContainer.bind(DataSource).toConstantValue(TypeOrmDataSource);
    iocContainer.bind<Koa>(Koa).toConstantValue(this.koa);
    iocContainer.bind(HttpServer).toConstantValue(this.httpServer);
  }

  /**
   * Обходит дерево модулей и регистрирует все провайдеры и bootstrapper-ы.
   */
  private loadModules(RootModule: Constructor): void {
    new ModuleLoader(iocContainer).load(RootModule);
  }

  private configureMiddleware(): void {
    RegisterAppMiddlewares(this.koa);
  }

  private configureRoutes(): void {
    const router = new KoaRouter();

    RegisterSystemRoutes(router, TypeOrmDataSource);
    RegisterSwagger(router, "/api-docs");
    RegisterRoutes(router);

    this.koa.use(router.routes());
    this.koa.use(router.allowedMethods());
    this.koa.use(notFoundMiddleware);
  }

  private async runBootstrappers(): Promise<void> {
    for (const bootstrapper of iocContainer.getAll<IBootstrap>(BOOTSTRAP)) {
      await bootstrapper.initialize();
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

  private async initializeDatabase(
    retries = 3,
    delayMs = 2000,
  ): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await TypeOrmDataSource.initialize();

        return;
      } catch (error) {
        logger.error(
          { err: error, attempt, retries },
          "Database connection failed",
        );

        if (attempt === retries) {
          throw error;
        }

        await new Promise(resolve => setTimeout(resolve, delayMs));
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
