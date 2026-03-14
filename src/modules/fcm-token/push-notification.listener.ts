import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { MessageCreatedEvent } from "../dialog/events";
import { ISocketEventListener } from "../socket/socket-event-listener.interface";
import { FcmTokenService } from "./fcm-token.service";

@Injectable()
export class PushNotificationListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(FcmTokenService) private readonly fcmTokenService: FcmTokenService,
  ) {}

  register(): void {
    this.eventBus.on(MessageCreatedEvent, this.onMessageCreated.bind(this));
  }

  private async onMessageCreated(event: MessageCreatedEvent): Promise<void> {
    const { message, recipientIds, unreadCounts } = event;

    await Promise.allSettled(
      recipientIds.map(recipientId =>
        this.sendPush(
          recipientId,
          message.text,
          message.dialogId,
          unreadCounts[recipientId] ?? 0,
        ),
      ),
    );
  }

  private async sendPush(
    recipientId: string,
    text: string,
    dialogId: string,
    badge: number,
  ): Promise<void> {
    try {
      const tokens = await this.fcmTokenService
        .getTokens(recipientId)
        .catch(() => []);

      await Promise.allSettled(
        tokens.map(async token => {
          try {
            await this.fcmTokenService.sendFcmMessage({
              dialogId,
              to: token.token,
              badge,
              message: {
                sound: "default",
                description: text,
                title: "New message",
              },
            });
          } catch {
            await this.fcmTokenService.deleteToken(token.id).catch(() => null);
          }
        }),
      );
    } catch (error) {
      logger.error(
        { err: error, recipientId },
        "PushNotificationListener: failed to send push",
      );
    }
  }
}
