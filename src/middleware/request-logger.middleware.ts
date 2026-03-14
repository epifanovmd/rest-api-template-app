import { Context, Next } from "koa";

import { logger } from "../core/logger";

export const requestLoggerMiddleware = async (ctx: Context, next: Next) => {
  const start = Date.now();
  const { method, url } = ctx.request;
  const requestId = ctx.state.requestId as string | undefined;

  await next();

  const durationMs = Date.now() - start;
  const { status } = ctx;
  const userId = (ctx.state.user as { id?: string } | undefined)?.id;

  const logData: Record<string, unknown> = {
    requestId,
    method,
    url,
    status,
    durationMs,
    ...(userId ? { userId } : {}),
  };

  if (status >= 500) {
    logger.error(logData, `${method} ${url} ${status}`);
  } else if (status >= 400) {
    logger.warn(logData, `${method} ${url} ${status}`);
  } else {
    logger.info(logData, `${method} ${url} ${status}`);
  }
};
