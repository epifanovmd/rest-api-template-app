import Koa from "koa";
import bodyParser from "koa-bodyparser";
import helmet from "koa-helmet";
import cors from "koa2-cors";
import { RateLimit } from "koa2-ratelimit";

export const appMiddlewares = (
  app: Koa<Koa.DefaultState, Koa.DefaultContext>,
) => {
  app
    .use(
      RateLimit.middleware({
        interval: 15 * 60 * 1000, // 15 minutes
        max: 100,
      }),
    )
    .use(
      bodyParser({
        detectJSON: ctx => (/\.json$/i).test(ctx.path),
      }),
    )
    .use(helmet())
    .use(cors());
};
