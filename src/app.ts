import KoaRouter from "@koa/router";
import Koa from "koa";
import logger from "koa-logger";
import sha256 from "sha256";
import { DataSource } from "typeorm";

import { config } from "../config";
import { iocContainer } from "./app.container";
import { loadAppModule } from "./app.module";
import {
  notFoundMiddleware,
  RegisterAppMiddlewares,
  RegisterSwagger,
} from "./middleware";
import { SocketService } from "./modules/socket";
import { SocketGateway } from "./modules/socket/socket.gateway";
import { UserService } from "./modules/user";
import { RegisterRoutes } from "./routes";

const isDevelopment = process.env.NODE_ENV === "development";

export class App {
  private readonly koaApp: Koa;

  constructor() {
    this.koaApp = new Koa();
    this.configure();
    loadAppModule();
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

    const userService = iocContainer.get<UserService>(UserService);

    SocketService.setup(iocContainer, this.koaApp);

    const socketGateway = iocContainer.get<SocketGateway>(SocketGateway);

    socketGateway.initialize();

    // Инициализация базы данных
    const dataSource = iocContainer.get(DataSource);

    await dataSource.initialize();

    await userService
      .createAdmin({
        email: config.auth.admin.email,
        passwordHash: sha256(config.auth.admin.password),
      })
      .catch(() => null);

    this.koaApp.listen(port, hostname, () => {
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
    });
  }
}
