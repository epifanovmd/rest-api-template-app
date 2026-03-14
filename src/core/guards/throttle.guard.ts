import { Context } from "koa";

import { IGuard } from "./types";

type ThrottleRecord = { count: number; resetAt: number };

/**
 * Ограничивает частоту запросов на конкретный роут.
 * Хранилище изолировано в замыкании — каждый вызов ThrottleGuard
 * создаёт независимый счётчик для своего роута.
 *
 * @param limit    — максимальное число запросов за окно
 * @param windowMs — размер окна в миллисекундах
 *
 * @example
 * @UseGuards(ThrottleGuard(5, 60_000)) // 5 запросов в минуту
 * @Post('/auth/sign-in')
 */
export const ThrottleGuard = (limit: number, windowMs: number) => {
  const store = new Map<string, ThrottleRecord>();

  return class implements IGuard {
    process(ctx: Context): boolean {
      const key = ctx.ip;
      const now = Date.now();
      const record = store.get(key);

      if (!record || now > record.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });

        return true;
      }

      if (record.count >= limit) {
        ctx.set(
          "Retry-After",
          String(Math.ceil((record.resetAt - now) / 1000)),
        );
        ctx.throw(429, "Too Many Requests");
      }

      record.count += 1;

      return true;
    }
  };
};
