import { z } from "zod";

import { Injectable } from "../../core";
import { ISocketHandler, onValidated, TSocket } from "../socket";

/** Подписка на изменения профилей: событие без данных, с лимитом частоты. */
const SubscribeSchema = z.undefined();

@Injectable()
export class ProfileHandler implements ISocketHandler {
  onConnection(socket: TSocket): void {
    onValidated(
      socket,
      "profile:subscribe",
      SubscribeSchema,
      () => {
        socket.join("profile");
      },
      { rateLimit: { perSecond: 1, burst: 5 } },
    );
  }
}
