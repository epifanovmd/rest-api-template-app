import KoaRouter from "@koa/router";
import { Server } from "http";
import Koa from "koa";
import logger from "koa-logger";

import { config } from "../config";
import { iocContainer } from "./app.container";
import { loadAppModule } from "./app.module";
import { BOOTSTRAP, IBootstrap } from "./core";
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
    if (isDevelopment) {
      this.koa.use(logger());
    }

    const router = new KoaRouter();

    router.get("/ping", context => {
      context.status = 200;
      context.body = { serverTime: new Date().toISOString() };
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
    const protocol = "http";
    const fullUrl = `${protocol}://${hostname}:${port}`;

    console.log("🚀  Server launched successfully!");
    console.log("📊 API Status");
    console.log(`   ├─ 🌐  Environment: ${process.env.NODE_ENV}`);
    console.log(`   ├─ 🏠  Host: ${fullUrl}`);

    if (hostname === "0.0.0.0" || hostname === "::") {
      console.log(`   └─ 🌍  Network: ${protocol}://localhost:${port}`);
    }

    console.log("📚 Documentation");
    console.log(`   ├─ 📖  Swagger UI: ${fullUrl}/api-docs`);
    console.log(`   ├─ 📄  OpenAPI JSON: ${fullUrl}/swagger.json`);

    console.log("🗄️ Database");
    console.log(
      `   ├─ 🌐  Host: ${config.database.postgres.host}:${config.database.postgres.port}`,
    );
    console.log(`   ├─ 📁  Database: ${config.database.postgres.database}`);
    console.log(`   └─ 👤  User: ${config.database.postgres.username}`);

    console.log("🎯  Ready to receive requests!\n");
  }
}
