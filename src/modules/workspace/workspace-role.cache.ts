import { unmanaged } from "inversify";
import type { Redis } from "ioredis";

import { getRedis, Injectable, logger } from "../../core";
import {
  isWorkspaceRole,
  type TWorkspaceRole,
  WORKSPACE_ROLE_CACHE_TTL_SECONDS,
} from "./workspace.types";

/** Маркер «не участник»: отрицательный ответ тоже кэшируется. */
const NONE = "-";
const KEY_PREFIX = "workspace:role:";
/** Предел записей локального кэша: дальше — уборка просроченных. */
const MEMORY_SWEEP_THRESHOLD = 10_000;

const cacheKey = (workspaceId: string, userId: string) =>
  `${KEY_PREFIX}${workspaceId}:${userId}`;

/** `undefined` — нет в кэше; `null` — закэшировано «не участник». */
export type TCachedWorkspaceRole = TWorkspaceRole | null | undefined;

/**
 * Кэш роли участника на `WORKSPACE_ROLE_CACHE_TTL_SECONDS`. С Redis — общий
 * для реплик, инвалидация видна всем процессам. Без Redis (один процесс) —
 * в памяти. Сбой Redis не ломает проверку доступа: кэш пропускается.
 */
@Injectable()
export class WorkspaceRoleCache {
  private readonly _memory = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(
    @unmanaged()
    private readonly _getRedis: () => Redis | undefined = getRedis,
  ) {}

  async get(
    workspaceId: string,
    userId: string,
  ): Promise<TCachedWorkspaceRole> {
    const key = cacheKey(workspaceId, userId);
    const redis = this._getRedis();
    let raw: string | null | undefined;

    if (redis) {
      try {
        raw = await redis.get(key);
      } catch (err) {
        logger.warn({ err }, "[Workspace] Кэш ролей недоступен");

        return undefined;
      }
    } else {
      const entry = this._memory.get(key);

      if (entry && entry.expiresAt > Date.now()) raw = entry.value;
      else if (entry) this._memory.delete(key);
    }

    if (raw === NONE) return null;

    return isWorkspaceRole(raw) ? raw : undefined;
  }

  async set(
    workspaceId: string,
    userId: string,
    role: TWorkspaceRole | null,
  ): Promise<void> {
    const key = cacheKey(workspaceId, userId);
    const value = role ?? NONE;
    const redis = this._getRedis();

    if (redis) {
      await redis
        .set(key, value, "EX", WORKSPACE_ROLE_CACHE_TTL_SECONDS)
        .catch(err =>
          logger.warn({ err }, "[Workspace] Не удалось закэшировать роль"),
        );

      return;
    }

    if (this._memory.size >= MEMORY_SWEEP_THRESHOLD) this._sweep();

    this._memory.set(key, {
      value,
      expiresAt: Date.now() + WORKSPACE_ROLE_CACHE_TTL_SECONDS * 1000,
    });
  }

  /** Сбросить роли пользователей пространства после изменения членства. */
  async invalidate(workspaceId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    const keys = userIds.map(userId => cacheKey(workspaceId, userId));
    const redis = this._getRedis();

    if (redis) {
      await redis
        .del(...keys)
        .catch(err =>
          logger.warn({ err }, "[Workspace] Не удалось сбросить кэш ролей"),
        );

      return;
    }

    for (const key of keys) this._memory.delete(key);
  }

  private _sweep(): void {
    const now = Date.now();

    for (const [key, entry] of this._memory) {
      if (entry.expiresAt <= now) this._memory.delete(key);
    }

    // Все записи свежие — сбрасываем целиком, чтобы память не росла.
    if (this._memory.size >= MEMORY_SWEEP_THRESHOLD) this._memory.clear();
  }
}
