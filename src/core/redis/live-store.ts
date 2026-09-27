import { getRedis } from "./redis";

/** Память процесса разрастается без Redis — чистим просроченное с этого размера. */
const MEM_PRUNE_AT = 50_000;

interface IMemEntry {
  value: string;
  expiresAt: number;
}

/**
 * Живое состояние с TTL, общее для процессов: последние снимки, счётчики,
 * отметки. Redis при наличии, иначе память процесса (single-process режим).
 * Модуль наследует класс со своим префиксом ключей и регистрирует
 * наследника в DI.
 */
export class LiveStore {
  private readonly _redis = getRedis();
  private readonly _mem = new Map<string, IMemEntry>();

  constructor(
    /** Префикс ключей модуля, например `stats:`. */
    private readonly _prefix: string,
  ) {}

  async getJson<T>(key: string): Promise<T | null> {
    if (this._redis) {
      const raw = await this._redis.get(this._prefix + key);

      return raw ? (JSON.parse(raw) as T) : null;
    }

    const entry = this._mem.get(key);

    if (!entry || entry.expiresAt < Date.now()) return null;

    return JSON.parse(entry.value) as T;
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (this._redis) {
      await this._redis.set(
        this._prefix + key,
        JSON.stringify(value),
        "EX",
        ttlSec,
      );

      return;
    }

    this._mem.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSec * 1000,
    });
    if (this._mem.size > MEM_PRUNE_AT) this._prune();
  }

  async delete(key: string): Promise<void> {
    if (this._redis) {
      await this._redis.del(this._prefix + key);

      return;
    }

    this._mem.delete(key);
  }

  /** Записать число, если ключа ещё нет; вернуть текущее значение. */
  async setIfAbsent(
    key: string,
    value: number,
    ttlSec: number,
  ): Promise<number> {
    if (this._redis) {
      await this._redis.set(
        this._prefix + key,
        String(value),
        "EX",
        ttlSec,
        "NX",
      );

      return Number((await this._redis.get(this._prefix + key)) ?? value);
    }

    const current = await this.getJson<number>(key);

    if (current === null) {
      await this.setJson(key, value, ttlSec);

      return value;
    }

    return current;
  }

  /** Атомарно прибавить к числу (между процессами — INCRBY); вернуть итог. */
  async incrBy(key: string, delta: number, ttlSec: number): Promise<number> {
    if (this._redis) {
      const total = await this._redis.incrby(
        this._prefix + key,
        Math.round(delta),
      );

      await this._redis.expire(this._prefix + key, ttlSec);

      return total;
    }

    const total = ((await this.getJson<number>(key)) ?? 0) + Math.round(delta);

    await this.setJson(key, total, ttlSec);

    return total;
  }

  private _prune(): void {
    const now = Date.now();

    for (const [key, entry] of this._mem) {
      if (entry.expiresAt < now) this._mem.delete(key);
    }
  }
}
