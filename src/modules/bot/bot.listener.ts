import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { MessageCreatedEvent } from "../message/events";
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
    this._eventBus.on(
      MessageCreatedEvent,
      async (event: MessageCreatedEvent) => {
        // Find bots in this chat
        const members = await this._memberRepo.findChatMembers(event.chatId);

        for (const member of members) {
          // Check if member is a bot (find by userId as ownerId pattern)
          const bots = await this._botRepo.find({
            where: { isActive: true },
          });

          for (const bot of bots) {
            if (!bot.webhookUrl) continue;

            const isCommand =
              event.message.content?.startsWith("/") ?? false;

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

            await this._webhookService.deliverEvent(bot, eventType, payload);
          }

          break; // Only process once per chat, not per member
        }
      },
    );
  }
}
