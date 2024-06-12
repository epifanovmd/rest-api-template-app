import { app, router } from "./app";

import { errorHandler, notFoundHandler } from "./common";
import { RegisterAppMiddlewares, RegisterSwagger } from "./middleware";
import { iocContainer } from "./modules";
import { RegisterRoutes } from "./routes";
import { SocketGateway } from "./services/socket/socket.gateway";

const PORT = Number(process.env.SERVER_PORT ?? 8181);
const HOST = process.env.SERVER_HOST ?? "0.0.0.0";

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

  app
    .use(errorHandler)
    .use(router.routes())
    .use(router.allowedMethods())
    .use(notFoundHandler)
    .listen(PORT, HOST, () => {
      console.info(`REST API Server running on : http://localhost:${PORT}`);
    });
};

bootstrap();
