import { inject } from "inversify";

import { Injectable, logger } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { SocketEmitterService } from "../socket";
import {
  ISyncResponseDto,
  ISyncVersionDto,
  SyncLogDto,
} from "./dto/sync.dto";
import { ESyncAction, ESyncEntityType } from "./sync.types";
import { SyncLogRepository } from "./sync-log.repository";

@Injectable()
export class SyncService {
  constructor(
    @inject(SyncLogRepository) private _syncLogRepo: SyncLogRepository,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
    @inject(SocketEmitterService) private _emitter: SocketEmitterService,
  ) {}

  /**
   * Инкрементальная синхронизация с компактификацией.
   *
   * Собирает все scopeIds пользователя (chatIds + в будущем folderIds и т.д.)
   * и запрашивает компактифицированные изменения.
   */
  async getChanges(
    userId: string,
    sinceVersion?: string,
    limit?: number,
  ): Promise<ISyncResponseDto> {
    const effectiveLimit = Math.min(limit ?? 100, 500);

    // 1. Проверка: не устарела ли версия клиента
    if (sinceVersion && sinceVersion !== "0") {
      const { oldest, latest } = await this._syncLogRepo.getVersionRange();

      if (BigInt(sinceVersion) > BigInt(latest || "0")) {
        return {
          changes: [],
          currentVersion: latest,
          hasMore: false,
          requiresSnapshot: true,
        };
      }

      if (oldest !== "0" && BigInt(sinceVersion) < BigInt(oldest)) {
        return {
          changes: [],
          currentVersion: latest,
          hasMore: false,
          requiresSnapshot: true,
        };
      }
    }

    // 2. Собираем ВСЕ scope IDs пользователя
    //    Сейчас: только chatIds. В будущем: folderIds, teamIds и т.д.
    const scopeIds = await this._collectUserScopeIds(userId);

    // 3. Компактифицированный запрос
    const { changes, hasMore } =
      await this._syncLogRepo.getCompactedChangesSince(
        userId,
        scopeIds,
        sinceVersion,
        effectiveLimit,
      );

    const currentVersion =
      changes.length > 0
        ? changes[changes.length - 1].version
        : await this._syncLogRepo.getLatestVersion();

    return {
      changes: changes.map(SyncLogDto.fromEntity),
      currentVersion,
      hasMore,
      requiresSnapshot: false,
    };
  }

  /** Получить текущую sync version. */
  async getCurrentVersion(): Promise<ISyncVersionDto> {
    const currentVersion = await this._syncLogRepo.getLatestVersion();

    return { currentVersion };
  }

  /**
   * Записать изменение в sync log и уведомить подписчиков через socket.
   *
   * Scope правила (взаимоисключающие):
   *   scopeId set, userId NULL  → scope-scoped (видно всем с доступом к scope)
   *   userId set,  scopeId NULL → user-scoped (видно только этому пользователю)
   */
  async logChange(
    entityType: ESyncEntityType,
    entityId: string,
    action: ESyncAction,
    opts: {
      userId?: string | null;
      scopeId?: string | null;
      payload?: Record<string, unknown> | null;
      notifyUserIds?: string[];
    } = {},
  ): Promise<void> {
    const hasUser = opts.userId != null;
    const hasScope = opts.scopeId != null;

    if (!hasUser && !hasScope) {
      logger.warn(
        { entityType, entityId, action },
        "[Sync] Rejected: both userId and scopeId are NULL (broadcast not allowed)",
      );

      return;
    }

    if (hasUser && hasScope) {
      logger.warn(
        { entityType, entityId, action },
        "[Sync] Rejected: both userId and scopeId are set (ambiguous scope)",
      );

      return;
    }

    const entityKey = `${entityType}:${entityId}`;

    const saved = await this._syncLogRepo.createAndSave({
      entityType,
      entityId,
      entityKey,
      action,
      userId: opts.userId ?? null,
      scopeId: opts.scopeId ?? null,
      payload: opts.payload ?? null,
    });

    // Write-time compaction: удаляем старые версии этого entity_key.
    // best-effort: если DELETE не пройдёт — DISTINCT ON при чтении + background job подчистят.
    this._syncLogRepo
      .deleteOlderVersions(entityKey, saved.version)
      .catch(err => {
        logger.warn(
          { err, entityKey, version: saved.version },
          "[Sync] Write-time compaction failed (non-critical)",
        );
      });

    // Push sync:available уведомление подписчикам
    if (opts.notifyUserIds && opts.notifyUserIds.length > 0) {
      const version = saved.version;

      for (const uid of opts.notifyUserIds) {
        this._emitter.toUser(uid, "sync:available", { version });
      }
    }
  }

  /** Удалить sync logs старше retentionDays. */
  async cleanup(retentionDays: number = 90): Promise<number> {
    const before = new Date();

    before.setDate(before.getDate() - retentionDays);

    return this._syncLogRepo.deleteOlderThan(before);
  }

  /** Компактификация: удалить дубликаты entity_key, оставив только последнюю версию. */
  async compact(): Promise<number> {
    try {
      const deleted = await this._syncLogRepo.compactDuplicates();

      if (deleted > 0) {
        logger.info({ deleted }, "[Sync] Compaction completed");
      }

      return deleted;
    } catch (err) {
      logger.error({ err }, "[Sync] Compaction failed");

      return 0;
    }
  }

  /**
   * Собрать все scope IDs, к которым у пользователя есть доступ.
   *
   * Точка расширения: при добавлении новых типов scoped сущностей
   * (folders, teams, channels) — добавить сюда их ID.
   */
  private async _collectUserScopeIds(userId: string): Promise<string[]> {
    // Сейчас: только chat memberships
    const chatIds = await this._memberRepo.getUserChatIds(userId);

    // В будущем:
    // const folderIds = await this._folderRepo.getUserFolderIds(userId);
    // const teamIds = await this._teamRepo.getUserTeamIds(userId);
    // return [...chatIds, ...folderIds, ...teamIds];

    return chatIds;
  }
}
