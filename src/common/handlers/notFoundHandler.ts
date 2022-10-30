import { Context, Next } from "koa";
import { ErrorType } from "../errorType";
import { ApiError } from "./errorHandler";

export const notFoundHandler = (ctx: Context, next: Next) => {
  if (ctx.status === 404) {
    ctx.status = 404;
    ctx.body = new ApiError(
      404,
      ErrorType.RouteNotFoundException,
    );
  }
};
