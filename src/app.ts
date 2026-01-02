import KoaRouter from "@koa/router";
import Koa from "koa";
import logger from "koa-logger";
import sha256 from "sha256";
import { DataSource } from "typeorm";

import { config } from "../config";
import { container } from "./core";
import { sequelize } from "./db";
import { AppDataSource } from "./db/data-source";
import {
  notFoundMiddleware,
  RegisterAppMiddlewares,
  RegisterSwagger,
} from "./middleware";
import { SocketGateway } from "./modules/socket";
import { UserService } from "./modules/user";
import { RegisterRoutes } from "./routes";

console.log("AppDataSource", !!AppDataSource);

const isDevelopment = process.env.NODE_ENV;

export class App {
  private readonly koaApp: Koa;

  constructor() {
    this.koaApp = new Koa();
    this.configure();
  }

  private configure() {
    if (isDevelopment) {
      this.koaApp.use(logger());
    }

    // API Routes
    // const router = RouterBuilder.build(container, UsersController);

    const router = new KoaRouter();

    router.get("/ping", context => {
      context.status = 200;
      context.body = {
        serverTime: new Date().toISOString(),
      };
    });

    RegisterAppMiddlewares(this.koaApp);
    RegisterSwagger(router, "/api-docs");
    RegisterRoutes(router);

    this.koaApp.use(router.routes());
    this.koaApp.use(router.allowedMethods());
    this.koaApp.use(notFoundMiddleware);
  }

  async start() {
    const port = config.server.port;
    const hostname = config.server.host;

    const userService = container.get<UserService>(UserService);
    // const socketGateway = container.get<SocketGateway>(SocketGateway);

    sequelize.sync({ force: false }).then(async () => {
      // await userService.createAdmin({
      //   email: config.auth.admin.email,
      //   passwordHash: sha256(config.auth.admin.password),
      // });
    });

    // socketGateway.initialize();

    // Инициализация базы данных
    const dataSource = container.get<DataSource>("DataSource");

    await dataSource.initialize();

    this.koaApp.listen(port, hostname, () => {
      const url = `http://${hostname}:${port}`;

      console.info(`REST API Server running on: ${url}`);
      console.info(`Swagger on: ${url}/api-docs`);

      console.log(`🚀 Server running on ${url}`);
      console.info(`Swagger on: ${url}/api-docs`);
      console.log(`📊 Database: ${config}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
    });
  }

  getKoaApp(): Koa {
    return this.koaApp;
  }
}
