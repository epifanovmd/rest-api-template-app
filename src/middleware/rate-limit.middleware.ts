import { RateLimit } from "koa2-ratelimit";

import { config } from "../../config";

const { RATE_LIMIT, RATE_LIMIT_INTERVAL, CORS_ALLOW_IPS } = config;

export const rateLimitMiddleware = RateLimit.middleware({
  interval: RATE_LIMIT_INTERVAL,
  max: RATE_LIMIT,
});
