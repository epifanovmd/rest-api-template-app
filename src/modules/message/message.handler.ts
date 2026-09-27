import { inject } from "inversify";

import { Injectable } from "../../core";
import { ISocketHandler, onValidated, TSocket } from "../socket";
import { MessageService } from "./message.service";
import {
  SocketMessageDeliveredSchema,
  SocketMessageReadSchema,
} from "./validation/message-socket.validate";

/** Лимиты частоты событий на сокет (token bucket). */
export const MESSAGE_SOCKET_LIMITS = {
  receipts: { perSecond: 10 },
} as const;

@Injectable()
export class MessageHandler implements ISocketHandler {
  constructor(
    @inject(MessageService) private _messageService: MessageService,
  ) {}

  onConnection(socket: TSocket): void {
    const { userId } = socket.data;

    onValidated(
      socket,
      "message:read",
      SocketMessageReadSchema,
      ({ chatId, messageIds }) =>
        this._messageService.markAsRead(chatId, userId, messageIds),
      { rateLimit: MESSAGE_SOCKET_LIMITS.receipts },
    );

    onValidated(
      socket,
      "message:delivered",
      SocketMessageDeliveredSchema,
      ({ chatId, messageIds }) =>
        this._messageService.markAsDelivered(chatId, userId, messageIds),
      { rateLimit: MESSAGE_SOCKET_LIMITS.receipts },
    );
  }
}
