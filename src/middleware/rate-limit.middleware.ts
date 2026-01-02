import RateLimit from "koa-ratelimit";

import { config } from "../../config";

const { rateLimit } = config;

// apply rate limit
const db = new Map();

export const rateLimitMiddleware = RateLimit({
  driver: "memory",
  db: db,
  duration: rateLimit.intervalMs,
  max: rateLimit.limit,
});
