import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { DialogService } from "../dialog/dialog.service";
import { MessageCreatedEvent } from "../dialog/events";
import { ISocketEventListener } from "../socket/socket-event-listener.interface";
import { FcmTokenService } from "./fcm-token.service";

@Injectable()
export class PushNotificationListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(FcmTokenService) private readonly fcmTokenService: FcmTokenService,
    @inject(DialogService) private readonly dialogService: DialogService,
  ) {}

  register(): void {
    this.eventBus.on(MessageCreatedEvent, this.onMessageCreated.bind(this));
  }

  private async onMessageCreated(event: MessageCreatedEvent): Promise<void> {
    const { message, recipientIds } = event;

    await Promise.allSettled(
      recipientIds.map(recipientId =>
        this.sendPush(recipientId, message.text, message.dialogId),
      ),
    );
  }

  private async sendPush(
    recipientId: string,
    text: string,
    dialogId: string,
  ): Promise<void> {
    try {
      const [tokens, badge] = await Promise.all([
        this.fcmTokenService.getTokens(recipientId).catch(() => []),
        this.dialogService.getUnreadMessagesCount(recipientId),
      ]);

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
