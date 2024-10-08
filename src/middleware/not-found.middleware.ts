import { NotFoundException } from "@force-dev/utils";
import { Context, Next } from "koa";

export const notFoundMiddleware = (ctx: Context, _next: Next) => {
  if (ctx.status === 404) {
    throw new NotFoundException();
  }
};
