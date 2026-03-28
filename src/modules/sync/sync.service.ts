import { inject } from "inversify";

import { Injectable } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { SyncLogDto } from "./dto/sync.dto";
import { ESyncAction, ESyncEntityType } from "./sync.types";
import { SyncLogRepository } from "./sync-log.repository";

@Injectable()
export class SyncService {
  constructor(
    @inject(SyncLogRepository) private _syncLogRepo: SyncLogRepository,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
  ) {}

  async getChanges(userId: string, sinceVersion?: string, limit?: number) {
    const memberships = await this._memberRepo.find({
      where: { userId },
      select: ["chatId"],
    });

    const chatIds = memberships.map(m => m.chatId);

    // If sinceVersion is ahead of the actual max version (e.g. DB was reset),
    // reset to fetch from the beginning
    if (sinceVersion) {
      const maxVersion = await this._syncLogRepo.getLatestVersion();

      if (BigInt(sinceVersion) > BigInt(maxVersion || "0")) {
        sinceVersion = undefined;
      }
    }

    const { changes, hasMore } = await this._syncLogRepo.getChangesSince(
      userId,
      chatIds,
      sinceVersion,
      limit ?? 100,
    );

    // Always return the real latest version, not the client's stale cursor
    const currentVersion = changes.length > 0
      ? changes[changes.length - 1].version
      : await this._syncLogRepo.getLatestVersion();

    return {
      changes: changes.map(SyncLogDto.fromEntity),
      currentVersion,
      hasMore,
    };
  }

  async logChange(
    entityType: ESyncEntityType,
    entityId: string,
    action: ESyncAction,
    opts: {
      userId?: string | null;
      chatId?: string | null;
      payload?: Record<string, unknown> | null;
    } = {},
  ) {
    await this._syncLogRepo.createAndSave({
      entityType,
      entityId,
      action,
      userId: opts.userId ?? null,
      chatId: opts.chatId ?? null,
      payload: opts.payload ?? null,
    });
  }
}
