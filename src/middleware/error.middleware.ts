import { HttpException } from "@force-dev/utils";
import { Context, Next } from "koa";

export const errorMiddleware = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof HttpException) {
      ctx.status = err.status;
      const exception = new HttpException(err.message, err.status, err.reason);

      exception.name = err.name;
      ctx.body = exception;
    } else {
      const status = (err as any).statusCode || (err as any).status || 500;

      ctx.status = status;
      ctx.body = new HttpException((err as Error).message, status, err);
    }
  }
};
