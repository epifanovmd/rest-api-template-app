import { inject } from "inversify";

import { Injectable, logger } from "../../core";
import { ChatMemberRepository } from "../chat/chat-member.repository";
import { ISocketHandler, SocketClientRegistry, TSocket } from "../socket";

/**
 * При подключении пользователя отправляет ему список онлайн-собеседников (presence:init).
 * Так клиент сразу знает, кто из контактов/собеседников сейчас в сети.
 */
@Injectable()
export class PresenceHandler implements ISocketHandler {
  constructor(
    @inject(ChatMemberRepository)
    private readonly chatMemberRepo: ChatMemberRepository,
    @inject(SocketClientRegistry)
    private readonly clientRegistry: SocketClientRegistry,
  ) {}

  async onConnection(socket: TSocket): Promise<void> {
    const { userId } = socket.data;

    try {
      const partnerIds =
        await this.chatMemberRepo.findDirectChatPartnerIds(userId);

      const onlineUserIds = partnerIds.filter(id =>
        this.clientRegistry.isOnline(id),
      );

      if (onlineUserIds.length > 0) {
        socket.emit("presence:init", { onlineUserIds });
      }
    } catch (err) {
      logger.error(
        { err, userId },
        "[Presence] Failed to send presence:init",
      );
    }
  }
}
