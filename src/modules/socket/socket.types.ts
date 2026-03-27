import { Server, Socket as SocketIO } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

import { AuthContext } from "../../types/koa";
import { CallDto } from "../call/dto/call.dto";
import { ChatDto, ChatLastMessageDto } from "../chat/dto/chat.dto";
import { ContactDto } from "../contact/dto/contact.dto";
import { MessageDto } from "../message/dto/message.dto";
import { PollDto } from "../poll/dto/poll.dto";
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
  /** Подтвердить доставку сообщений */
  "message:delivered": (data: { chatId: string; messageIds: string[] }) => void;

  // ─── E2E Encryption ───────────────────────────────────────────────────
  /** Отправить key exchange для секретного чата */
  "e2e:key-exchange": (data: {
    chatId: string;
    targetUserId: string;
    keyBundle: Record<string, unknown>;
  }) => void;
  /** Ratchet step */
  "e2e:ratchet": (data: {
    chatId: string;
    newPublicKey: string;
  }) => void;

  // ─── Call (WebRTC signaling) ──────────────────────────────────────────
  /** Relay SDP offer */
  "call:offer": (data: {
    callId: string;
    targetUserId: string;
    sdp: unknown;
  }) => void;
  /** Relay SDP answer */
  "call:answer": (data: {
    callId: string;
    targetUserId: string;
    sdp: unknown;
  }) => void;
  /** Relay ICE candidate */
  "call:ice-candidate": (data: {
    callId: string;
    targetUserId: string;
    candidate: unknown;
  }) => void;
  /** Hangup signal */
  "call:hangup": (data: {
    callId: string;
    targetUserId: string;
  }) => void;
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
  /** Реакция на сообщение */
  "message:reaction": (
    ...args: [
      {
        messageId: string;
        chatId: string;
        userId: string;
        emoji: string | null;
      },
    ]
  ) => void;
  /** Сообщение закреплено */
  "message:pinned": (...args: [MessageDto]) => void;
  /** Сообщение откреплено */
  "message:unpinned": (
    ...args: [{ messageId: string; chatId: string }]
  ) => void;
  /** Обновление статуса доставки сообщения */
  "message:status": (
    ...args: [{ messageId: string; chatId: string; status: string }]
  ) => void;
  /** Сообщение самоуничтожено */
  "message:self-destructed": (
    ...args: [{ messageId: string; chatId: string }]
  ) => void;

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
  /** Чат закреплён/откреплён */
  "chat:pinned": (
    ...args: [{ chatId: string; isPinned: boolean }]
  ) => void;
  /** Чат архивирован/разархивирован */
  "chat:archived": (
    ...args: [{ chatId: string; isArchived: boolean }]
  ) => void;
  /** Роль участника чата изменена */
  "chat:member:role-changed": (
    ...args: [{ chatId: string; userId: string; role: string }]
  ) => void;
  /** Обновление последнего сообщения чата */
  "chat:last-message": (
    ...args: [{ chatId: string; lastMessage: ChatLastMessageDto | null }]
  ) => void;

  // ─── Poll events ──────────────────────────────────────────────────────
  /** Голос в опросе */
  "poll:voted": (...args: [PollDto]) => void;
  /** Опрос закрыт */
  "poll:closed": (...args: [PollDto]) => void;

  // ─── Chat moderation events ──────────────────────────────────────────
  /** Режим медленной отправки изменён */
  "chat:slow-mode": (
    ...args: [{ chatId: string; seconds: number }]
  ) => void;
  /** Участник заблокирован */
  "chat:member:banned": (
    ...args: [{ chatId: string; userId: string; bannedBy: string; reason?: string }]
  ) => void;
  /** Участник разблокирован */
  "chat:member:unbanned": (
    ...args: [{ chatId: string; userId: string }]
  ) => void;

  // ─── Call events ─────────────────────────────────────────────────────
  /** Входящий звонок */
  "call:incoming": (...args: [CallDto]) => void;
  /** Звонок принят */
  "call:answered": (...args: [CallDto]) => void;
  /** Звонок отклонён */
  "call:declined": (...args: [CallDto]) => void;
  /** Звонок завершён */
  "call:ended": (...args: [CallDto | { callId: string; endedBy: string }]) => void;
  /** Пропущенный звонок */
  "call:missed": (...args: [CallDto]) => void;
  /** Relay SDP offer */
  "call:offer": (
    ...args: [{ callId: string; fromUserId: string; sdp: unknown }]
  ) => void;
  /** Relay SDP answer */
  "call:answer": (
    ...args: [{ callId: string; fromUserId: string; sdp: unknown }]
  ) => void;
  /** Relay ICE candidate */
  "call:ice-candidate": (
    ...args: [{ callId: string; fromUserId: string; candidate: unknown }]
  ) => void;

  // ─── User events ──────────────────────────────────────────────────────
  /** Email пользователя подтверждён */
  "user:email-verified": (...args: [{ verified: boolean }]) => void;

  // ─── E2E Encryption events ─────────────────────────────────────────────
  /** Relay key exchange от другого участника */
  "e2e:key-exchange": (
    ...args: [
      {
        chatId: string;
        fromUserId: string;
        keyBundle: Record<string, unknown>;
      },
    ]
  ) => void;
  /** Relay ratchet step */
  "e2e:ratchet": (
    ...args: [{ chatId: string; fromUserId: string; newPublicKey: string }]
  ) => void;
  /** Предупреждение о малом количестве prekeys */
  "e2e:prekeys-low": (...args: [{ count: number }]) => void;
  /** Устройство отозвано */
  "e2e:device-revoked": (...args: [{ deviceId: string }]) => void;

  // ─── Sync events ───────────────────────────────────────────────────────
  /** Уведомление о наличии новых изменений для sync */
  "sync:available": (...args: [{ version: string }]) => void;

  // ─── Contact events ─────────────────────────────────────────────────────
  /** Запрос на добавление в контакты */
  "contact:request": (...args: [ContactDto]) => void;
  /** Контакт принят */
  "contact:accepted": (...args: [ContactDto]) => void;
  /** Контакт удалён */
  "contact:removed": (...args: [{ contactId: string }]) => void;
  /** Контакт заблокирован */
  "contact:blocked": (...args: [ContactDto]) => void;
  /** Контакт разблокирован */
  "contact:unblocked": (...args: [ContactDto]) => void;

  // ─── User events ─────────────────────────────────────────────────────
  /** Пароль изменён */
  "user:password-changed": (
    ...args: [{ userId: string; method: "change" | "reset" }]
  ) => void;
  /** Привилегии пользователя изменены */
  "user:privileges-changed": (
    ...args: [{ roles: string[]; permissions: string[] }]
  ) => void;
  /** Username пользователя изменён */
  "user:username-changed": (
    ...args: [{ userId: string; username: string | null }]
  ) => void;

  // ─── Push events ──────────────────────────────────────────────────────
  /** Настройки уведомлений изменены */
  "push:settings-changed": (...args: [Record<string, never>]) => void;

  // ─── Profile privacy events ───────────────────────────────────────────
  /** Настройки приватности изменены */
  "profile:privacy-changed": (...args: [Record<string, never>]) => void;

  // ─── Auth events ──────────────────────────────────────────────────────
  /** Изменение статуса 2FA */
  "auth:2fa-changed": (...args: [{ enabled: boolean }]) => void;

  // ─── Session events ─────────────────────────────────────────────────────
  /** Новая сессия авторизована */
  "session:new": (...args: [{ sessionId: string }]) => void;
  /** Сессия завершена */
  "session:terminated": (
    ...args: [{ sessionId: string }]
  ) => void;

  // ─── Error event ──────────────────────────────────────────────────────
  /** Общая ошибка обработки socket-события */
  error: (...args: [{ event: string; message: string }]) => void;
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
