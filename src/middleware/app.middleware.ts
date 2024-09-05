import Koa from "koa";
import bodyParser from "koa-bodyparser";
import helmet from "koa-helmet";
import cors from "koa2-cors";
import { RateLimit } from "koa2-ratelimit";

import { config } from "../../config";

const jsonRegexp = new RegExp(/\.json$/i);

export const RegisterAppMiddlewares = (
  app: Koa<Koa.DefaultState, Koa.DefaultContext>,
) => {
  app
    .use(
      RateLimit.middleware({
        interval: config.RATE_LIMIT_INTERVAL,
        max: config.RATE_LIMIT,
      }),
    )
    .use(
      bodyParser({
        detectJSON: ctx => jsonRegexp.test(ctx.path),
      }),
    )
    .use(
      helmet({
        contentSecurityPolicy: false,
      }),
    )
    .use(
      cors({
        origin(ctx) {
          if (
            ctx.request.header.origin &&
            config.CORS_ALLOW_IPS.includes(ctx.request.header.origin)
          ) {
            return ctx.request.header.origin;
          }

          return false;
        },
        exposeHeaders: ["WWW-Authenticate", "Server-Authorization"],
        maxAge: 5,
        credentials: true,
        allowMethods: ["GET", "POST", "PATCH", "DELETE"],
        allowHeaders: ["Content-Type", "Authorization", "Accept"],
      }),
    );
};
