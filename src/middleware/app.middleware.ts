import Koa from "koa";

import { bodyParserMiddleware } from "./body-parser.middleware";
import { corsMiddleware } from "./cors.middleware";
import { errorMiddleware } from "./error.middleware";
import { helmetMiddleware } from "./helmet.middleware";
import { rateLimitMiddleware } from "./rate-limit.middleware";

export const RegisterAppMiddlewares = (
  app: Koa<Koa.DefaultState, Koa.DefaultContext>,
) => {
  app
    .use(errorMiddleware)
    // .use(corsMiddleware)
    // .use(rateLimitMiddleware)
    .use(bodyParserMiddleware);
  // .use(helmetMiddleware)
};
