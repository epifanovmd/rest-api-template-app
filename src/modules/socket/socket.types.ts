import { Server, Socket as SocketIO } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

import { AuthContext } from "../../types/koa";
import { PublicProfileDto } from "../profile/dto";

// ─── События Клиент → Сервер ─────────────────────────────────────────────

export interface ISocketEvents {
  "profile:subscribe": () => void;
}

// ─── События Сервер → Клиент ─────────────────────────────────────────────

export interface ISocketEmitEvents {
  /** Успешная аутентификация по JWT токену */
  authenticated: (...args: [{ userId: string }]) => void;
  /** Ошибка аутентификации */
  auth_error: (...args: [{ message: string }]) => void;

  /** Изменение статуса конкретного сервера */
  "profile:updated": (...args: [PublicProfileDto]) => void;
}

// ─── Типы Socket ─────────────────────────────────────────────────────────────

export type TSocket = SocketIO<
  ISocketEvents,
  ISocketEmitEvents,
  DefaultEventsMap,
  AuthContext
>;

export type TServer = Server<
  ISocketEvents,
  ISocketEmitEvents,
  DefaultEventsMap,
  AuthContext
>;
