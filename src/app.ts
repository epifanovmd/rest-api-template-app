import KoaRouter from "@koa/router";
import { Server } from "http";
import Koa from "koa";
import { DataSource } from "typeorm";

import { config } from "../config";
import { iocContainer } from "./app.container";
import { loadAppModule } from "./app.module";
import { BOOTSTRAP, IBootstrap } from "./core";
import { logger } from "./core/logger";
import {
  notFoundMiddleware,
  RegisterAppMiddlewares,
  RegisterSwagger,
} from "./middleware";
import { RegisterRoutes } from "./routes";

const isDevelopment = process.env.NODE_ENV === "development";

export class App {
  private readonly koa: Koa;
  private server?: Server;

  constructor() {
    this.koa = new Koa();
  }

  async start(): Promise<void> {
    loadAppModule(this.koa);
    this.configure();
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

  private configure(): void {
    const router = new KoaRouter();

    router.get("/ping", context => {
      context.status = 200;
      context.body = { serverTime: new Date().toISOString() };
    });

    router.get("/health", async context => {
      let dbStatus = "ok";

      try {
        const dataSource = iocContainer.get(DataSource);

        await dataSource.query("SELECT 1");
      } catch {
        dbStatus = "error";
      }

      const status = dbStatus === "ok" ? 200 : 503;

      context.status = status;
      context.body = {
        status: status === 200 ? "ok" : "degraded",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? "unknown",
        services: { db: dbStatus },
      };
    });

    RegisterAppMiddlewares(this.koa);
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
