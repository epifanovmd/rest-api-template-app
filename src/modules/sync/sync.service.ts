import { inject } from "inversify";

import { Injectable } from "../../core";
import { ChatRepository } from "../chat/chat.repository";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ChatDto } from "../chat/dto";
import { MessageService } from "../message/message.service";
import { ISyncSnapshotDto } from "./dto/sync.dto";
import { SyncLogDto } from "./dto/sync.dto";
import { ESyncAction, ESyncEntityType } from "./sync.types";
import { SyncLogRepository } from "./sync-log.repository";

@Injectable()
export class SyncService {
  constructor(
    @inject(SyncLogRepository) private _syncLogRepo: SyncLogRepository,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
    @inject(ChatRepository) private _chatRepo: ChatRepository,
    @inject(MessageService) private _messageService: MessageService,
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

  async getSnapshot(userId: string): Promise<ISyncSnapshotDto> {
    const [chatsResult, currentVersion] = await Promise.all([
      this._chatRepo.findUserChats(userId),
      this._syncLogRepo.getLatestVersion(),
    ]);

    const [chats] = chatsResult;
    const chatDtos = chats.map(chat => ChatDto.fromEntity(chat, userId));

    // Compute unread counts in parallel
    const unreadEntries = await Promise.all(
      chatDtos.map(async chat => {
        const count = await this._messageService.getUnreadCount(
          chat.id,
          userId,
        );

        return [chat.id, count] as const;
      }),
    );

    const unreadCounts: Record<string, number> = {};

    for (const [chatId, count] of unreadEntries) {
      if (count > 0) {
        unreadCounts[chatId] = count;
      }
    }

    return {
      chats: chatDtos,
      unreadCounts,
      currentVersion,
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
