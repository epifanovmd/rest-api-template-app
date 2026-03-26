import { Server, Socket as SocketIO } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

import { AuthContext } from "../../types/koa";
import { ChatDto } from "../chat/dto/chat.dto";
import { ContactDto } from "../contact/dto/contact.dto";
import { MessageDto } from "../message/dto/message.dto";
import { PublicProfileDto } from "../profile/dto";

// ─── События Клиент → Сервер ─────────────────────────────────────────────

export interface ISocketEvents {
  "profile:subscribe": () => void;

  /** Присоединиться к комнате чата */
  "chat:join": (data: { chatId: string }) => void;
  /** Покинуть комнату чата */
  "chat:leave": (data: { chatId: string }) => void;
  /** Индикатор набора текста */
  "chat:typing": (data: { chatId: string }) => void;
  /** Отметить сообщения как прочитанные */
  "message:read": (data: { chatId: string; messageId: string }) => void;
}

// ─── События Сервер → Клиент ─────────────────────────────────────────────

export interface ISocketEmitEvents {
  /** Успешная аутентификация по JWT токену */
  authenticated: (...args: [{ userId: string }]) => void;
  /** Ошибка аутентификации */
  auth_error: (...args: [{ message: string }]) => void;

  /** Изменение профиля */
  "profile:updated": (...args: [PublicProfileDto]) => void;

  // ─── Chat events ────────────────────────────────────────────────────────
  /** Новое сообщение */
  "message:new": (...args: [MessageDto]) => void;
  /** Сообщение отредактировано */
  "message:updated": (...args: [MessageDto]) => void;
  /** Сообщение удалено */
  "message:deleted": (...args: [{ messageId: string; chatId: string }]) => void;

  /** Новый чат создан */
  "chat:created": (...args: [ChatDto]) => void;
  /** Чат обновлён */
  "chat:updated": (...args: [ChatDto]) => void;
  /** Кто-то набирает текст */
  "chat:typing": (
    ...args: [{ chatId: string; userId: string }]
  ) => void;
  /** Обновление счётчика непрочитанных */
  "chat:unread": (
    ...args: [{ chatId: string; unreadCount: number }]
  ) => void;
  /** Участник добавлен */
  "chat:member:joined": (...args: [{ chatId: string; userId: string }]) => void;
  /** Участник удалён */
  "chat:member:left": (...args: [{ chatId: string; userId: string }]) => void;

  // ─── Contact events ─────────────────────────────────────────────────────
  /** Запрос на добавление в контакты */
  "contact:request": (...args: [ContactDto]) => void;
  /** Контакт принят */
  "contact:accepted": (...args: [ContactDto]) => void;
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
