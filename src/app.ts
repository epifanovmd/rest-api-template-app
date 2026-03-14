import KoaRouter from "@koa/router";
import { Server } from "http";
import { decorate, injectable } from "inversify";
import Koa from "koa";
import { Controller } from "tsoa";
import { DataSource } from "typeorm";

import { config } from "../config";
import { iocContainer } from "./app.container";
import { BOOTSTRAP, IBootstrap } from "./core";
import { TypeOrmDataSource } from "./core/db";
import { logger } from "./core/logger";
import { ModuleLoader } from "./core/module-loader";
import {
  notFoundMiddleware,
  RegisterAppMiddlewares,
  RegisterSwagger,
} from "./middleware";
import { RegisterRoutes } from "./routes";

type Constructor = new (...args: any[]) => any;

export class App {
  private readonly koa: Koa;
  private server?: Server;

  constructor() {
    this.koa = new Koa();
  }

  async start(RootModule: Constructor): Promise<void> {
    this.registerCoreBindings();
    this.loadModules(RootModule);
    this.configureMiddleware();
    this.configureRoutes();
    await this.runBootstrappers();
    this.server = await this.listen();
  }

  async stop(): Promise<void> {
    const bootstrappers = iocContainer.getAll<IBootstrap>(BOOTSTRAP).reverse();

    for (const bootstrapper of bootstrappers) {
      await bootstrapper.destroy?.();
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close(err => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Регистрирует примитивы, которые не могут быть частью модуля:
   * DataSource (создан статически) и Koa (создан в конструкторе App).
   * tsoa требует, чтобы базовый класс Controller был injectable.
   */
  private registerCoreBindings(): void {
    decorate(injectable(), Controller);
    iocContainer.bind(DataSource).toConstantValue(TypeOrmDataSource);
    iocContainer.bind<Koa>(Koa).toConstantValue(this.koa);
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

    router.get("/ping", ctx => {
      ctx.status = 200;
      ctx.body = { serverTime: new Date().toISOString() };
    });

    router.get("/health", async ctx => {
      let dbStatus = "ok";

      try {
        const dataSource = iocContainer.get(DataSource);

        await dataSource.query("SELECT 1");
      } catch {
        dbStatus = "error";
      }

      const status = dbStatus === "ok" ? 200 : 503;

      ctx.status = status;
      ctx.body = {
        status: status === 200 ? "ok" : "degraded",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? "unknown",
        services: { db: dbStatus },
      };
    });

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

  private listen(): Promise<Server> {
    return new Promise(resolve => {
      const { port, host } = config.server;
      const server = this.koa.listen(port, host, () => {
        this.logStartup(host, port);
        resolve(server);
      });
    });
  }

  private logStartup(hostname: string, port: number): void {
    const { host: dbHost, port: dbPort, database } = config.database.postgres;

    logger.info(
      {
        env: process.env.NODE_ENV,
        url: `http://${hostname}:${port}`,
        swagger: `http://${hostname}:${port}/api-docs`,
        db: `${dbHost}:${dbPort}/${database}`,
      },
      "Server launched successfully",
    );
  }
}
