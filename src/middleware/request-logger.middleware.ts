import { Context, Next } from "koa";

import { logger } from "../core/logger";

const SLOW_REQUEST_THRESHOLD_MS = 2000;

export const requestLoggerMiddleware = async (ctx: Context, next: Next) => {
  const start = Date.now();
  const { method, url } = ctx.request;
  const requestId = ctx.state.requestId as string;

  // Дочерний логгер автоматически передаёт requestId во все вложенные вызовы
  const reqLogger = logger.child({ requestId });

  ctx.state.logger = reqLogger;

  try {
    await next();
  } finally {
    const durationMs = Date.now() - start;
    const { status } = ctx;
    const userId = (ctx.state.user as { userId?: string } | undefined)?.userId;

    const data = {
      method,
      url,
      status,
      durationMs,
      ...(userId && { userId }),
    };

    if (status >= 500) {
      reqLogger.error(data, `${method} ${url} ${status}`);
    } else if (status >= 400) {
      reqLogger.warn(data, `${method} ${url} ${status}`);
    } else if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
      reqLogger.warn({ ...data, slow: true }, `${method} ${url} ${status} — slow request`);
    } else {
      reqLogger.info(data, `${method} ${url} ${status}`);
    }
  }
};
