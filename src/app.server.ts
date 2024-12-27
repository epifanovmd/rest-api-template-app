import logger from "koa-logger";
import sha256 from "sha256";

import { config } from "../config";
import { app, router } from "./app";
import { iocContainer } from "./app.module";
import { sequelize } from "./db";
import {
  notFoundMiddleware,
  RegisterAppMiddlewares,
  RegisterSwagger,
} from "./middleware";
// import { ProfileService } from "./modules/profile";
import { SocketGateway } from "./modules/socket/socket.gateway";
import { RegisterRoutes } from "./routes";

const { SERVER_HOST, SERVER_PORT, ADMIN_EMAIL, ADMIN_PASSWORD } = config;

// const profileService = iocContainer.get(ProfileService);
const socketGateway = iocContainer.get(SocketGateway);

const isDevelopment = process.env.NODE_ENV;

const bootstrap = () => {
  sequelize.sync({ force: false }).then();

  sequelize.afterBulkSync(async () => {
    // await profileService.createAdmin({
    //   email: ADMIN_EMAIL,
    //   passwordHash: sha256(ADMIN_PASSWORD),
    // });
  });

  socketGateway.start();

  router.get("/ping", context => {
    context.status = 200;
    context.body = {
      serverTime: new Date().toISOString(),
    };
  });

  if (isDevelopment) {
    app.use(logger());
  }

  RegisterAppMiddlewares(app);
  RegisterSwagger(router, "/api-docs");
  RegisterRoutes(router);

  return app
    .use(router.routes())
    .use(router.allowedMethods())
    .use(notFoundMiddleware)
    .listen(SERVER_PORT, SERVER_HOST, async () => {
      const url = `http://${SERVER_HOST}:${SERVER_PORT}`;

      console.info(`REST API Server running on: ${url}`);
      console.info(`Swagger on: ${url}/api-docs`);
    });
};

export const appServer = bootstrap();
