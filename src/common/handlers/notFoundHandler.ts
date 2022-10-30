import { Context, Next } from "koa";
import { ErrorType } from "../errorType";
import { ApiError } from "./errorHandler";

export const notFoundHandler = (ctx: Context, next: Next) => {
  if (ctx.status === 404) {
    ctx.status = 404;
    ctx.body = {
      message: "Route not found",
      error: new ApiError(
        404,
        ErrorType.RouteNotFoundException,
        "Route not found",
      ),
    };
  }
};
