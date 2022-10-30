import { Context, Next } from "koa";
import { ErrorType } from "../errorType";
import { ApiError } from "./errorHandler";

export const notFoundHandler = (ctx: Context, next: Next) => {
  if (ctx.status === 404) {
    const err = new ApiError(
      404,
      ErrorType.RouteNotFoundException,
      "Route not found",
    );

    ctx.status = 404;
    ctx.body = {
      message: err.message,
      error: { status: err.status, type: err.type, message: err.message },
    };
  }
};
