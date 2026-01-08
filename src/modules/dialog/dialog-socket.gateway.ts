import { inject } from "inversify";

import { Injectable } from "../../core";
import { DialogMessagesService } from "../dialog-messages";
import { SocketService } from "../socket";
import { TSocket } from "../socket/socket.types";
import { PublicUserDto } from "../user/dto";
import { User } from "../user/user.entity";
import { DialogRepository } from "./dialog.repository";

@Injectable()
export class DialogSocketGateway {
  private typingTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly TYPING_DEBOUNCE_TIME = 2000;

  constructor(
    @inject(SocketService) private _socketService: SocketService,
    @inject(DialogRepository) private _dialogRepository: DialogRepository,
    @inject(DialogMessagesService)
    private _dialogMessagesService: DialogMessagesService,
  ) {}

  public initialize(): void {
    this._socketService.io.on("connection", async socket => {
      const user = socket.data; // Пользователь из middleware

      const userDialogs = await this._dialogRepository.find({
        where: { members: { userId: user.id } },
        select: {
          id: true,
        },
      });

      userDialogs.forEach(dialog => {
        socket.join(`dialog_${dialog.id}`);
      });

      // socket.on("join_dialog", async (dialogId: string) => {
      //   socket.join(`dialog_${dialogId}`);
      // });
      //
      // socket.on("leave_dialog", async (dialogId: string) => {
      //   socket.leave(`dialog_${dialogId}`);
      // });

      this.setupMessageHandlers(socket, user);
      this.setupPresenceHandlers(socket, user);
      this.setupTypingHandlers(socket, user);
    });
  }

  private setupMessageHandlers(socket: TSocket, user: User): void {
    socket.on(
      "messageReceived",
      async (messageIds: string[], dialogId: string) => {
        try {
          await this._dialogMessagesService.updateReceived(messageIds);

          // Отправляем подтверждение о получении сообщения
          this._socketService.broadcastToRoom(
            `dialog_${dialogId}`,
            "messageReceived",
            {
              messageIds,
              dialogId,
            },
          );
        } catch (error) {
          console.error(`Failed to update message status: ${error.message}`);
        }
      },
    );
  }

  private setupPresenceHandlers(socket: TSocket, user: User): void {
    // Уведомляем о онлайн статусе
    socket.on("online", (isOnline: boolean) => {
      socket.rooms.forEach(room => {
        if (room.startsWith("dialog_")) {
          socket.to(room).emit("online", {
            userId: user.id,
            isOnline,
          });
        }
      });
    });

    // Проверка онлайн статуса
    socket.on(
      "checkOnline",
      (userId: string, callback: (isOnline: boolean) => void) => {
        const isOnline = this._socketService.getClient(userId) !== undefined;

        callback(isOnline);
      },
    );
  }

  private setupTypingHandlers(socket: TSocket, user: User): void {
    socket.on("typing", (dialogId: string) => {
      const timeoutKey = `${user.id}_${dialogId}`;
      const existingTimeout = this.typingTimeouts.get(timeoutKey);

      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      socket.broadcast.to(`dialog_${dialogId}`).emit("typing", {
        user: PublicUserDto.fromEntity(user),
        isTyping: true,
      });

      const timeout = setTimeout(() => {
        socket.broadcast.to(`dialog_${dialogId}`).emit("typing", {
          user: PublicUserDto.fromEntity(user),
          isTyping: false,
        });
        this.typingTimeouts.delete(timeoutKey);
      }, this.TYPING_DEBOUNCE_TIME);

      this.typingTimeouts.set(timeoutKey, timeout);
    });

    socket.on("disconnect", () => {
      console.info(`User ${user.id} disconnected`);
      Array.from(this.typingTimeouts.entries())
        .filter(([key]) => key.startsWith(`${user.id}_`))
        .forEach(([key, timeout]) => {
          clearTimeout(timeout);
          this.typingTimeouts.delete(key);
        });
    });
  }
}
