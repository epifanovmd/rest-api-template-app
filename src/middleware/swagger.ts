import KoaRouter from "koa-router";
import { koaSwagger } from "koa2-swagger-ui";
import swaggerDoc from "../../swagger.json";

export const RegisterSwagger = (router: KoaRouter, url: string) => {
  const koaMiddleware = koaSwagger({
    routePrefix: false,
    swaggerOptions: {
      showRequestHeaders: true,
      spec: swaggerDoc,
      jsonEditor: true,
    },
  });

  router.get(url, koaMiddleware);
};
