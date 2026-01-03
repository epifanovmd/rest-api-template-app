import { inject } from "inversify";

import { Injectable } from "../../core";
import { IUserDto } from "../user/user.dto";
import { SocketService } from "./socket.service";
import { TSocket } from "./socket.types";

@Injectable()
export class SocketGateway {
  private typingTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly TYPING_DEBOUNCE_TIME = 2000;

  constructor(@inject(SocketService) private socketService: SocketService) {}

  public initialize(): void {
    this.socketService.io.on("connection", socket => {
      const user = socket.data; // Пользователь из middleware

      this.setupConnectionHandlers(socket, user);
      this.setupMessageHandlers(socket, user);
      this.setupPresenceHandlers(socket, user);
      this.setupTypingHandlers(socket, user);

      console.info(`Socket gateway initialized for user ${user?.id}`);
    });
  }

  private setupConnectionHandlers(socket: TSocket, user: IUserDto): void {
    // Подписываемся на комнату пользователя
    socket.join(`user_${user.id}`);

    socket.on("disconnect", () => {
      console.info(`User ${user.id} disconnected`);
      this.clearTypingState(user.id);
    });

    socket.on("error", err => {
      console.error(`Socket error for user ${user.id}: ${err.message}`);
    });
  }

  private setupMessageHandlers(socket: TSocket, user: IUserDto): void {
    // socket.on(
    //   "messageReceived",
    //   async (messageIds: string[], dialogId: string) => {
    //     try {
    //       await DialogMessages.update(
    //         { received: true },
    //         { where: { id: messageIds } },
    //       );
    //
    //       // Отправляем подтверждение о получении сообщения
    //       this.socketService.broadcastToRoom(
    //         `user_${user.id}`,
    //         "messageReceived",
    //         { messageIds, dialogId },
    //       );
    //     } catch (error) {
    //       console.error(`Failed to update message status: ${error.message}`);
    //     }
    //   },
    // );
  }

  private setupPresenceHandlers(socket: TSocket, user: IUserDto): void {
    // Уведомляем о онлайн статусе
    socket.on("online", (isOnline: boolean) => {
      this.socketService.broadcastToRoom(`user_${user.id}`, "online", {
        userId: user.id,
        isOnline,
      });
    });

    // Проверка онлайн статуса
    socket.on(
      "checkOnline",
      (userId: string, callback: (isOnline: boolean) => void) => {
        const isOnline = this.socketService.getClient(userId) !== undefined;

        callback(isOnline);
      },
    );
  }

  private setupTypingHandlers(socket: TSocket, user: IUserDto): void {
    socket.on("typingStart", (dialogId: string) => {
      this.handleTypingEvent(user.id, dialogId, true);
    });

    socket.on("typingStop", (dialogId: string) => {
      this.handleTypingEvent(user.id, dialogId, false);
    });
  }

  private handleTypingEvent(
    userId: string,
    dialogId: string,
    isTyping: boolean,
  ): void {
    // Очищаем предыдущий таймаут
    const timeoutKey = `${userId}_${dialogId}`;
    const existingTimeout = this.typingTimeouts.get(timeoutKey);

    if (existingTimeout) clearTimeout(existingTimeout);

    if (isTyping) {
      // Уведомляем о начале печати
      this.socketService.broadcastToRoom(`dialog_${dialogId}`, "typing", {
        userId,
        isTyping: true,
      });

      // Устанавливаем таймаут для автоматического остановки
      const timeout = setTimeout(() => {
        this.socketService.broadcastToRoom(`dialog_${dialogId}`, "typing", {
          userId,
          isTyping: false,
        });
        this.typingTimeouts.delete(timeoutKey);
      }, this.TYPING_DEBOUNCE_TIME);

      this.typingTimeouts.set(timeoutKey, timeout);
    } else {
      // Немедленно уведомляем о остановке печати
      this.socketService.broadcastToRoom(`dialog_${dialogId}`, "typing", {
        userId,
        isTyping: false,
      });
    }
  }

  private clearTypingState(userId: string): void {
    // Очищаем все таймауты для пользователя
    Array.from(this.typingTimeouts.entries())
      .filter(([key]) => key.startsWith(`${userId}_`))
      .forEach(([key, timeout]) => {
        clearTimeout(timeout);
        this.typingTimeouts.delete(key);
      });
  }
}
