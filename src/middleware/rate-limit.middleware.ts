import RateLimit from "koa-ratelimit";

import { config } from "../../config";

const { RATE_LIMIT, RATE_LIMIT_INTERVAL } = config;

// apply rate limit
const db = new Map();

export const rateLimitMiddleware = RateLimit({
  driver: "memory",
  db: db,
  duration: RATE_LIMIT_INTERVAL,
  max: RATE_LIMIT,
});
