import { config } from "../config";
import { app, router } from "./app";
import { errorHandler, notFoundHandler } from "./common";
import { RegisterAppMiddlewares, RegisterSwagger } from "./middleware";
import { iocContainer } from "./modules";
import { RegisterRoutes } from "./routes";
import { SocketGateway } from "./services/socket/socket.gateway";

const { SERVER_HOST, SERVER_PORT } = config;

const socketGateway = iocContainer.get(SocketGateway);

const bootstrap = () => {
  socketGateway.start();

  router.get("/ping", context => {
    context.status = 200;
    context.body = {
      serverTime: new Date().toISOString(),
    };
  });

  RegisterAppMiddlewares(app);
  RegisterSwagger(router, "/api-docs");
  RegisterRoutes(router);

  return app
    .use(errorHandler)
    .use(router.routes())
    .use(router.allowedMethods())
    .use(notFoundHandler)
    .listen(SERVER_PORT, SERVER_HOST, () => {
      const url = `http://${SERVER_HOST}:${SERVER_PORT}`;

      console.info(`REST API Server running on: ${url}`);
      console.info(`Swagger on: ${url}/api-docs`);
    });
};

export const server = bootstrap();
