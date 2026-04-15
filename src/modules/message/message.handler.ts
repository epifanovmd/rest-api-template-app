import { inject } from "inversify";

import { Injectable, logger } from "../../core";
import { ISocketHandler, TSocket } from "../socket";
import { MessageService } from "./message.service";

@Injectable()
export class MessageHandler implements ISocketHandler {
  constructor(
    @inject(MessageService) private _messageService: MessageService,
  ) {}

  onConnection(socket: TSocket): void {
    socket.on("message:read", async ({ chatId, messageIds, messageId }, ack) => {
      try {
        // Support both old (single messageId) and new (array messageIds) format
        const ids = messageIds ?? (messageId ? [messageId] : []);

        if (ids.length > 0) {
          await this._messageService.markAsRead(
            chatId,
            socket.data.userId,
            ids,
          );
        }

        ack?.({ ok: true });
      } catch (err) {
        logger.warn(
          { err, chatId, userId: socket.data.userId },
          "[MessageHandler] message:read failed",
        );
        ack?.({ ok: false, error: "Failed to mark as read" });
      }
    });

    socket.on("message:delivered", async ({ chatId, messageIds }, ack) => {
      try {
        await this._messageService.markAsDelivered(
          chatId,
          socket.data.userId,
          messageIds,
        );

        ack?.({ ok: true });
      } catch (err) {
        logger.warn(
          { err, chatId, userId: socket.data.userId },
          "[MessageHandler] message:delivered failed",
        );
        ack?.({ ok: false, error: "Failed to mark as delivered" });
      }
    });
  }
}
