import { Context, Next } from "koa";

import { HttpException } from "../common";

export const errorMiddleware = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof HttpException) {
      ctx.status = err.getStatus();
      const exception = new HttpException(
        err.getResponse(),
        err.getStatus(),
        err.getOptions(),
      );

      exception.name = err.name;

      ctx.body = exception;
    } else {
      const status = err.statusCode || err.status || 500;

      ctx.status = status;
      ctx.body = new HttpException(
        HttpException.createBody(err.message, undefined, status),
        status,
        { cause: err },
      );
    }
  }
};
