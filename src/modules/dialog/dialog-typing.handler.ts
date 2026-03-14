import { inject } from "inversify";

import { Injectable, logger } from "../../core";
import { ISocketHandler, TSocket } from "../socket";
import { PublicUserDto } from "../user/dto";
import { UserRepository } from "../user/user.repository";

/**
 * Отвечает за typing-индикатор в диалогах.
 *
 * Debounce: если пользователь продолжает печатать — таймер сбрасывается.
 * Через TYPING_DEBOUNCE_MS после последнего события автоматически
 * рассылается isTyping=false.
 */
@Injectable()
export class DialogTypingHandler implements ISocketHandler {
  private readonly typingTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly TYPING_DEBOUNCE_MS = 2000;

  constructor(
    @inject(UserRepository)
    private readonly userRepository: UserRepository,
  ) {}

  async onConnection(socket: TSocket): Promise<void> {
    const { userId } = socket.data;

    // Загружаем только profile (для PublicUserDto) — без role и permissions
    const user = await this.userRepository.findById(userId, {
      profile: { avatar: true },
    });

    if (!user) {
      logger.warn(
        { userId },
        "[DialogTypingHandler] user not found on connection",
      );

      return;
    }

    const publicUser = PublicUserDto.fromEntity(user);

    socket.on("typing", (dialogId: string) => {
      if (!socket.rooms.has(`dialog_${dialogId}`)) return;

      const key = `${userId}_${dialogId}`;
      const existing = this.typingTimeouts.get(key);

      if (existing) clearTimeout(existing);

      socket.broadcast.to(`dialog_${dialogId}`).emit("typing", {
        user: publicUser,
        isTyping: true,
      });

      const timeout = setTimeout(() => {
        socket.broadcast.to(`dialog_${dialogId}`).emit("typing", {
          user: publicUser,
          isTyping: false,
        });
        this.typingTimeouts.delete(key);
      }, this.TYPING_DEBOUNCE_MS);

      this.typingTimeouts.set(key, timeout);
    });

    socket.on("disconnect", () => {
      this.clearUserTypingTimeouts(userId);
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
