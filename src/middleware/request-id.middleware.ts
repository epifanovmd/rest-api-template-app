import { Context, Next } from "koa";
import { v4 as uuidv4, validate as uuidValidate } from "uuid";

export const REQUEST_ID_HEADER = "X-Request-ID";

export const requestIdMiddleware = async (ctx: Context, next: Next) => {
  const incoming = ctx.request.headers[
    REQUEST_ID_HEADER.toLowerCase()
  ] as string;
  const requestId = incoming && uuidValidate(incoming) ? incoming : uuidv4();

  ctx.set(REQUEST_ID_HEADER, requestId);
  ctx.state.requestId = requestId;

  await next();
};
