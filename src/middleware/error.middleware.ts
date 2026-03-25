import { HttpException } from "@force-dev/utils";
import { Context, Next } from "koa";

import { logger } from "../core";

export const errorMiddleware = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof HttpException) {
      ctx.status = err.status;
      ctx.body = new HttpException(err.message, err.status, err.reason);
    } else {
      const status =
        typeof (err as any)?.statusCode === "number"
          ? (err as any).statusCode
          : typeof (err as any)?.status === "number"
            ? (err as any).status
            : 500;

      logger.error(
        { err, requestId: ctx.state.requestId },
        "Unhandled error in request",
      );

      ctx.status = status;
      ctx.body = new HttpException(
        status >= 500 ? "Internal Server Error" : (err as Error).message,
        status,
      );
    }
  }
};
