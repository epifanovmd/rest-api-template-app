import { inject, multiInject, optional } from "inversify";

import { Injectable, logger } from "../../core";
import { ISocketHandler, SocketClientRegistry, TSocket } from "../socket";
import { IPresenceAudience, PRESENCE_AUDIENCE } from "./profile.relations";

/**
 * При подключении пользователя отправляет ему список онлайн-собеседников (presence:init).
 * Так клиент сразу знает, кто из контактов/собеседников сейчас в сети.
 */
@Injectable()
export class PresenceHandler implements ISocketHandler {
  constructor(
    @inject(SocketClientRegistry)
    private readonly clientRegistry: SocketClientRegistry,
    @multiInject(PRESENCE_AUDIENCE)
    @optional()
    private readonly audiences: IPresenceAudience[] = [],
  ) {}

  async onConnection(socket: TSocket): Promise<void> {
    const { userId } = socket.data;

    try {
      const lists = await Promise.all(
        this.audiences.map(audience => audience.peers(userId)),
      );
      const onlineUserIds = await this.clientRegistry.filterOnline([
        ...new Set(lists.flat()),
      ]);

      if (onlineUserIds.length > 0) {
        socket.emit("presence:init", { onlineUserIds });
      }
    } catch (err) {
      logger.error({ err, userId }, "[Presence] Failed to send presence:init");
    }
  }
}
