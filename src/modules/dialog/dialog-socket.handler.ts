import { inject, injectable } from "inversify";

import { logger } from "../../core";
import { DialogMessagesService } from "../dialog-messages";
import {
  ISocketHandler,
  SocketClientRegistry,
  SocketEmitterService,
  TSocket,
} from "../socket";
import { UserService } from "../user";
import { PublicUserDto } from "../user/dto";
import { User } from "../user/user.entity";
import { DialogRepository } from "./dialog.repository";

@injectable()
export class DialogSocketHandler implements ISocketHandler {
  private readonly typingTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly TYPING_DEBOUNCE_MS = 2000;

  constructor(
    @inject(SocketClientRegistry)
    private readonly clientRegistry: SocketClientRegistry,
    @inject(SocketEmitterService)
    private readonly emitter: SocketEmitterService,
    @inject(DialogRepository)
    private readonly dialogRepository: DialogRepository,
    @inject(DialogMessagesService)
    private readonly messagesService: DialogMessagesService,
    @inject(UserService)
    private readonly userService: UserService,
  ) {}

  async onConnection(socket: TSocket): Promise<void> {
    const { userId } = socket.data;

    const [dialogs, user] = await Promise.all([
      this.dialogRepository.find({
        where: { members: { userId } },
        select: { id: true },
      }),
      this.userService.getUser(userId),
    ]);

    dialogs.forEach(dialog => socket.join(`dialog_${dialog.id}`));

    this.registerMessageHandlers(socket);
    this.registerPresenceHandlers(socket);
    this.registerTypingHandlers(socket, user);
  }

  private registerMessageHandlers(socket: TSocket): void {
    socket.on(
      "messageReceived",
      async (messageIds: string[], dialogId: string) => {
        try {
          await this.messagesService.updateReceived(messageIds);
          this.emitter.toRoom(`dialog_${dialogId}`, "messageReceived", {
            messageIds,
            dialogId,
          });
        } catch (err) {
          logger.error({ err }, "[DialogSocketHandler] messageReceived error");
        }
      },
    );

    socket.on("join_dialog", (dialogId: string) => {
      socket.join(`dialog_${dialogId}`);
    });

    socket.on("leave_dialog", (dialogId: string) => {
      socket.leave(`dialog_${dialogId}`);
    });
  }

  private registerPresenceHandlers(socket: TSocket): void {
    const { userId } = socket.data;

    socket.on("online", (isOnline: boolean) => {
      socket.rooms.forEach(room => {
        if (room.startsWith("dialog_")) {
          socket.to(room).emit("online", { userId, isOnline });
        }
      });
    });

    socket.on(
      "checkOnline",
      (targetUserId: string, callback: (isOnline: boolean) => void) => {
        callback(this.clientRegistry.isOnline(targetUserId));
      },
    );
  }

  private registerTypingHandlers(socket: TSocket, user: User): void {
    socket.on("typing", (dialogId: string) => {
      const key = `${user.id}_${dialogId}`;
      const existing = this.typingTimeouts.get(key);

      if (existing) clearTimeout(existing);

      socket.broadcast.to(`dialog_${dialogId}`).emit("typing", {
        user: PublicUserDto.fromEntity(user),
        isTyping: true,
      });

      const timeout = setTimeout(() => {
        socket.broadcast.to(`dialog_${dialogId}`).emit("typing", {
          user: PublicUserDto.fromEntity(user),
          isTyping: false,
        });
        this.typingTimeouts.delete(key);
      }, this.TYPING_DEBOUNCE_MS);

      this.typingTimeouts.set(key, timeout);
    });

    socket.on("disconnect", () => {
      this.clearUserTypingTimeouts(user.id);
    });
  }

  private clearUserTypingTimeouts(userId: string): void {
    for (const [key, timeout] of this.typingTimeouts) {
      if (key.startsWith(`${userId}_`)) {
        clearTimeout(timeout);
        this.typingTimeouts.delete(key);
      }
    }
  }
}
