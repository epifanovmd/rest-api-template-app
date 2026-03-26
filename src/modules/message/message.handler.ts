import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketHandler, TSocket } from "../socket";
import { MessageService } from "./message.service";

@Injectable()
export class MessageHandler implements ISocketHandler {
  constructor(
    @inject(MessageService) private _messageService: MessageService,
  ) {}

  onConnection(socket: TSocket): void {
    socket.on("message:read", async ({ chatId, messageId }) => {
      try {
        await this._messageService.markAsRead(
          chatId,
          socket.data.userId,
          messageId,
        );
      } catch {
        // Ignore errors in socket handler — user may not be a member
      }
    });

    socket.on("message:delivered", async ({ chatId, messageIds }) => {
      try {
        await this._messageService.markAsDelivered(
          chatId,
          socket.data.userId,
          messageIds,
        );
      } catch {
        // Ignore errors in socket handler
      }
    });
  }
}
