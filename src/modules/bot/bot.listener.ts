import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ChatMemberJoinedEvent } from "../chat/events/chat-member-joined.event";
import { ChatMemberLeftEvent } from "../chat/events/chat-member-left.event";
import { MessageCreatedEvent } from "../message/events";
import { MessageDeletedEvent } from "../message/events/message-deleted.event";
import { MessageUpdatedEvent } from "../message/events/message-updated.event";
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
