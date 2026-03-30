import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { CallEndedEvent, CallInitiatedEvent } from "../call/events/call.event";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ChatCreatedEvent } from "../chat/events/chat-created.event";
import { ChatMemberJoinedEvent } from "../chat/events/chat-member-joined.event";
import { ChatMemberLeftEvent } from "../chat/events/chat-member-left.event";
import { ChatMemberRoleChangedEvent } from "../chat/events/chat-member-role-changed.event";
import { ChatUpdatedEvent } from "../chat/events/chat-updated.event";
import {
  ChatMemberBannedEvent,
  ChatMemberUnbannedEvent,
} from "../chat/events/moderation.event";
import { MessageCreatedEvent } from "../message/events";
import { MessageDeletedEvent } from "../message/events/message-deleted.event";
import {
  MessagePinnedEvent,
  MessageUnpinnedEvent,
} from "../message/events/message-pinned.event";
import { MessageReactionEvent } from "../message/events/message-reaction.event";
import { MessageUpdatedEvent } from "../message/events/message-updated.event";
import { PollClosedEvent } from "../poll/events/poll-closed.event";
import { PollCreatedEvent } from "../poll/events/poll-created.event";
import { PollVotedEvent } from "../poll/events/poll-voted.event";
import { ISocketEventListener } from "../socket";
import { BotRepository } from "./bot.repository";
import { WebhookService } from "./webhook.service";

@Injectable()
export class BotListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(BotRepository) private readonly _botRepo: BotRepository,
    @inject(ChatMemberRepository)
    private readonly _memberRepo: ChatMemberRepository,
    @inject(WebhookService)
    private readonly _webhookService: WebhookService,
  ) {}

  register(): void {
    // ── New message / command ──────────────────────────────────────
    this._eventBus.on(
      MessageCreatedEvent,
      async (event: MessageCreatedEvent) => {
        const isCommand = event.message.content?.startsWith("/") ?? false;
        const eventType = isCommand ? "command" : "message";

        const payload: Record<string, unknown> = {
          messageId: event.message.id,
          chatId: event.chatId,
          senderId: event.message.senderId,
          content: event.message.content,
          type: event.message.type,
        };

        if (isCommand && event.message.content) {
          const parts = event.message.content.slice(1).split(" ");

          payload.command = parts[0];
          payload.args = parts.slice(1).join(" ");
        }

        await this._deliverToChat(event.chatId, eventType, payload);
      },
    );

    // ── Message edited ────────────────────────────────────────────
    this._eventBus.on(
      MessageUpdatedEvent,
      async (event: MessageUpdatedEvent) => {
        await this._deliverToChat(event.chatId, "message_edited", {
          messageId: event.message.id,
          chatId: event.chatId,
          senderId: event.message.senderId,
          content: event.message.content,
          type: event.message.type,
        });
      },
    );

    // ── Message deleted ───────────────────────────────────────────
    this._eventBus.on(
      MessageDeletedEvent,
      async (event: MessageDeletedEvent) => {
        await this._deliverToChat(event.chatId, "message_deleted", {
          messageId: event.messageId,
          chatId: event.chatId,
        });
      },
    );

    // ── Message reaction ──────────────────────────────────────────
    this._eventBus.on(
      MessageReactionEvent,
      async (event: MessageReactionEvent) => {
        await this._deliverToChat(event.chatId, "message_reaction", {
          messageId: event.messageId,
          chatId: event.chatId,
          userId: event.userId,
          emoji: event.emoji,
        });
      },
    );

    // ── Message pinned ────────────────────────────────────────────
    this._eventBus.on(
      MessagePinnedEvent,
      async (event: MessagePinnedEvent) => {
        await this._deliverToChat(event.chatId, "message_pinned", {
          messageId: event.message.id,
          chatId: event.chatId,
          pinnedByUserId: event.pinnedByUserId,
        });
      },
    );

    // ── Message unpinned ──────────────────────────────────────────
    this._eventBus.on(
      MessageUnpinnedEvent,
      async (event: MessageUnpinnedEvent) => {
        await this._deliverToChat(event.chatId, "message_unpinned", {
          messageId: event.messageId,
          chatId: event.chatId,
        });
      },
    );

    // ── Member joined ─────────────────────────────────────────────
    this._eventBus.on(
      ChatMemberJoinedEvent,
      async (event: ChatMemberJoinedEvent) => {
        await this._deliverToMembers(
          event.memberUserIds,
          "member_joined",
          {
            chatId: event.chatId,
            userId: event.userId,
          },
        );
      },
    );

    // ── Member left ───────────────────────────────────────────────
    this._eventBus.on(
      ChatMemberLeftEvent,
      async (event: ChatMemberLeftEvent) => {
        await this._deliverToMembers(
          event.memberUserIds,
          "member_left",
          {
            chatId: event.chatId,
            userId: event.userId,
          },
        );
      },
    );

    // ── Member role changed ───────────────────────────────────────
    this._eventBus.on(
      ChatMemberRoleChangedEvent,
      async (event: ChatMemberRoleChangedEvent) => {
        await this._deliverToChat(event.chatId, "member_role_changed", {
          chatId: event.chatId,
          userId: event.userId,
          role: event.role,
          changedBy: event.changedBy,
        });
      },
    );

    // ── Member banned ─────────────────────────────────────────────
    this._eventBus.on(
      ChatMemberBannedEvent,
      async (event: ChatMemberBannedEvent) => {
        await this._deliverToChat(event.chatId, "member_banned", {
          chatId: event.chatId,
          userId: event.targetUserId,
          bannedBy: event.bannedByUserId,
          duration: event.duration ?? null,
          reason: event.reason ?? null,
        });
      },
    );

    // ── Member unbanned ───────────────────────────────────────────
    this._eventBus.on(
      ChatMemberUnbannedEvent,
      async (event: ChatMemberUnbannedEvent) => {
        await this._deliverToChat(event.chatId, "member_unbanned", {
          chatId: event.chatId,
          userId: event.targetUserId,
          unbannedBy: event.unbannedByUserId,
        });
      },
    );

    // ── Chat created ──────────────────────────────────────────────
    this._eventBus.on(
      ChatCreatedEvent,
      async (event: ChatCreatedEvent) => {
        await this._deliverToMembers(
          event.memberUserIds,
          "chat_created",
          {
            chatId: event.chat.id,
            type: event.chat.type,
          },
        );
      },
    );

    // ── Chat updated ──────────────────────────────────────────────
    this._eventBus.on(
      ChatUpdatedEvent,
      async (event: ChatUpdatedEvent) => {
        await this._deliverToChat(event.chat.id, "chat_updated", {
          chatId: event.chat.id,
          type: event.chat.type,
        });
      },
    );

    // ── Poll created ──────────────────────────────────────────────
    this._eventBus.on(
      PollCreatedEvent,
      async (event: PollCreatedEvent) => {
        await this._deliverToMembers(
          event.memberUserIds,
          "poll_created",
          {
            pollId: event.poll.id,
            chatId: event.chatId,
            messageId: event.message.id,
            question: event.poll.question,
            isAnonymous: event.poll.isAnonymous,
            isMultipleChoice: event.poll.isMultipleChoice,
          },
        );
      },
    );

    // ── Poll voted ────────────────────────────────────────────────
    this._eventBus.on(PollVotedEvent, async (event: PollVotedEvent) => {
      await this._deliverToChat(event.chatId, "poll_voted", {
        pollId: event.poll.id,
        chatId: event.chatId,
        userId: event.userId,
      });
    });

    // ── Poll closed ───────────────────────────────────────────────
    this._eventBus.on(PollClosedEvent, async (event: PollClosedEvent) => {
      await this._deliverToChat(event.chatId, "poll_closed", {
        pollId: event.poll.id,
        chatId: event.chatId,
        closedBy: event.userId,
      });
    });

    // ── Call initiated ────────────────────────────────────────────
    this._eventBus.on(
      CallInitiatedEvent,
      async (event: CallInitiatedEvent) => {
        if (!event.call.chatId) return;

        await this._deliverToChat(event.call.chatId, "call_initiated", {
          callId: event.call.id,
          chatId: event.call.chatId,
          callerId: event.call.callerId,
          calleeId: event.call.calleeId,
          type: event.call.type,
        });
      },
    );

    // ── Call ended ────────────────────────────────────────────────
    this._eventBus.on(CallEndedEvent, async (event: CallEndedEvent) => {
      if (!event.call.chatId) return;

      await this._deliverToChat(event.call.chatId, "call_ended", {
        callId: event.call.id,
        chatId: event.call.chatId,
        callerId: event.call.callerId,
        calleeId: event.call.calleeId,
        type: event.call.type,
        duration: event.call.duration,
        status: event.call.status,
      });
    });
  }

  /**
   * Find bots owned by chat members and deliver the event.
   * Resolves member list from DB.
   */
  private async _deliverToChat(
    chatId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const memberUserIds =
      await this._memberRepo.getMemberUserIds(chatId);

    await this._deliverToMembers(memberUserIds, eventType, payload);
  }

  /**
   * For each user in the list, find their active bots and deliver.
   */
  private async _deliverToMembers(
    memberUserIds: string[],
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    if (memberUserIds.length === 0) return;

    for (const userId of memberUserIds) {
      const bots = await this._botRepo.findByOwnerId(userId);

      for (const bot of bots) {
        if (!bot.isActive || !bot.webhookUrl) continue;

        await this._webhookService.deliverEvent(bot, eventType, payload);
      }
    }
  }
}
