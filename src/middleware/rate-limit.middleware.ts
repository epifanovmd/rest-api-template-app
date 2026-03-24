import RateLimit from "koa-ratelimit";

import { config } from "../config";

const { rateLimit } = config;

// Применяем ограничение частоты запросов
const db = new Map();

export const rateLimitMiddleware = RateLimit({
  driver: "memory",
  db: db,
  duration: rateLimit.intervalMs,
  max: rateLimit.limit,
});
