import { Context, Next } from "koa";

import { ApiError } from "./error.handler";

export const notFoundHandler = (ctx: Context, next: Next) => {
  if (ctx.status === 404) {
    const err = new ApiError("RouteNotFoundException", 404);

    ctx.status = 404;
    ctx.body = {
      message: err.message,
      error: { status: err.status, type: err.type, message: err.message },
    };
  }
};
