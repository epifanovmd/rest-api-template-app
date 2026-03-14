import { Context, Next } from "koa";
import { v4 as uuidv4 } from "uuid";

export const REQUEST_ID_HEADER = "X-Request-ID";

export const requestIdMiddleware = async (ctx: Context, next: Next) => {
  const requestId =
    (ctx.request.headers[REQUEST_ID_HEADER.toLowerCase()] as string) ||
    uuidv4();

  ctx.set(REQUEST_ID_HEADER, requestId);
  ctx.state.requestId = requestId;

  await next();
};
