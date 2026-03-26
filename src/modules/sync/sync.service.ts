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

    const { changes, hasMore } = await this._syncLogRepo.getChangesSince(
      userId,
      chatIds,
      sinceVersion,
      limit ?? 100,
    );

    const currentVersion = changes.length > 0
      ? changes[changes.length - 1].version
      : sinceVersion ?? "0";

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
