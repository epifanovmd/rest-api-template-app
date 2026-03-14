import { HttpException } from "@force-dev/utils";
import { Context, Next } from "koa";

import { logger } from "../core/logger";

export const errorMiddleware = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    const requestId = ctx.state.requestId as string | undefined;

    if (err instanceof HttpException) {
      ctx.status = err.status;
      const exception = new HttpException(err.message, err.status, err.reason);

      exception.name = err.name;
      ctx.body = exception;

      if (err.status >= 500) {
        logger.error(
          { err, requestId, url: ctx.url, method: ctx.method },
          `${ctx.method} ${ctx.url} ${err.status}`,
        );
      }
    } else {
      const status = (err as any).statusCode || (err as any).status || 500;

      ctx.status = status;
      ctx.body = new HttpException((err as Error).message, status, err);

      logger.error(
        { err, requestId, url: ctx.url, method: ctx.method },
        `Unhandled error: ${ctx.method} ${ctx.url} ${status}`,
      );
    }
  }
};
