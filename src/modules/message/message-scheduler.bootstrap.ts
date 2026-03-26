import { inject } from "inversify";
import { LessThanOrEqual } from "typeorm";

import { EventBus, Injectable, logger } from "../../core";
import { IBootstrap } from "../../core/bootstrap";
import { ChatService } from "../chat/chat.service";
import { MessageDto } from "./dto";
import { MessageCreatedEvent, MessageDeletedEvent } from "./events";
import { MessageRepository } from "./message.repository";

@Injectable()
export class MessageSchedulerBootstrap implements IBootstrap {
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly CHECK_INTERVAL_MS = 10_000; // 10 seconds

  constructor(
    @inject(MessageRepository) private _messageRepo: MessageRepository,
    @inject(ChatService) private _chatService: ChatService,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async initialize(): Promise<void> {
    this._intervalId = setInterval(async () => {
      try {
        await this._processScheduledMessages();
        await this._processSelfDestructMessages();
      } catch (error) {
        logger.error({ err: error }, "MessageScheduler tick failed");
      }
    }, MessageSchedulerBootstrap.CHECK_INTERVAL_MS);

    logger.info("MessageSchedulerBootstrap initialized");
  }

  async destroy(): Promise<void> {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  private async _processScheduledMessages() {
    const now = new Date();

    const scheduled = await this._messageRepo.find({
      where: {
        isScheduled: true,
        scheduledAt: LessThanOrEqual(now),
      },
      relations: {
        sender: { profile: true },
        replyTo: { sender: { profile: true } },
        attachments: { file: true },
        reactions: true,
      },
    });

    for (const message of scheduled) {
      message.isScheduled = false;
      await this._messageRepo.save(message);

      const memberUserIds = await this._chatService.getMemberUserIds(
        message.chatId,
      );

      this._eventBus.emit(
        new MessageCreatedEvent(message, message.chatId, memberUserIds),
      );

      logger.info(
        { messageId: message.id },
        "Scheduled message sent",
      );
    }
  }

  private async _processSelfDestructMessages() {
    const now = new Date();

    const expired = await this._messageRepo.find({
      where: {
        selfDestructAt: LessThanOrEqual(now),
        isDeleted: false,
      },
    });

    for (const message of expired) {
      message.isDeleted = true;
      message.content = null;
      await this._messageRepo.save(message);

      this._eventBus.emit(
        new MessageDeletedEvent(message.id, message.chatId),
      );

      logger.info(
        { messageId: message.id },
        "Self-destruct message deleted",
      );
    }
  }
}
