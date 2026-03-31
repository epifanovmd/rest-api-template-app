import { Server, Socket as SocketIO } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

import { AuthContext } from "../../types/koa";
import { CallDto } from "../call/dto/call.dto";
import { ChatDto, ChatLastMessageDto } from "../chat/dto/chat.dto";
import { ContactDto } from "../contact/dto/contact.dto";
import { MessageDto } from "../message/dto/message.dto";
import { PollDto } from "../poll/dto/poll.dto";
import { PublicProfileDto } from "../profile/dto";

// ─── Payload-интерфейсы: Клиент → Сервер ─────────────────────────────────

export interface ISocketChatRoomPayload {
  chatId: string;
}

export interface ISocketMessageReadPayload {
  chatId: string;
  messageId: string;
}

export interface ISocketMessageDeliveredPayload {
  chatId: string;
  messageIds: string[];
}

export interface ISocketCallSignalPayload {
  callId: string;
  targetUserId: string;
  sdp: unknown;
}

export interface ISocketCallIceCandidatePayload {
  callId: string;
  targetUserId: string;
  candidate: unknown;
}

export interface ISocketCallHangupPayload {
  callId: string;
  targetUserId: string;
}

// ─── Payload-интерфейсы: Сервер → Клиент ─────────────────────────────────

export interface ISocketAuthenticatedPayload {
  userId: string;
}

export interface ISocketAuthErrorPayload {
  message: string;
}

export interface ISocketMessageIdentifierPayload {
  messageId: string;
  chatId: string;
}

export interface ISocketMessageReactionPayload {
  messageId: string;
  chatId: string;
  userId: string;
  emoji: string | null;
}

export interface ISocketMessageStatusPayload {
  messageId: string;
  chatId: string;
  status: string;
}

export interface ISocketChatTypingPayload {
  chatId: string;
  userId: string;
}

export interface ISocketChatUnreadPayload {
  chatId: string;
  unreadCount: number;
}

export interface ISocketChatMemberPayload {
  chatId: string;
  userId: string;
}

export interface ISocketChatPinnedPayload {
  chatId: string;
  isPinned: boolean;
}

export interface ISocketChatMemberRoleChangedPayload {
  chatId: string;
  userId: string;
  role: string;
}

export interface ISocketChatLastMessagePayload {
  chatId: string;
  lastMessage: ChatLastMessageDto | null;
}

export interface ISocketChatSlowModePayload {
  chatId: string;
  seconds: number;
}

export interface ISocketChatMemberBannedPayload {
  chatId: string;
  userId: string;
  bannedBy: string;
  reason?: string;
}

export interface ISocketCallEndedPayload {
  callId: string;
  endedBy: string;
}

export interface ISocketCallRelayPayload {
  callId: string;
  fromUserId: string;
  sdp: unknown;
}

export interface ISocketCallIceCandidateRelayPayload {
  callId: string;
  fromUserId: string;
  candidate: unknown;
}

export interface ISocketUserEmailVerifiedPayload {
  verified: boolean;
}

export interface ISocketSyncAvailablePayload {
  version: string;
}

export interface ISocketContactRemovedPayload {
  contactId: string;
}

export interface ISocketUserPasswordChangedPayload {
  userId: string;
  method: "change" | "reset";
}

export interface ISocketUserPrivilegesChangedPayload {
  roles: string[];
  permissions: string[];
}

export interface ISocketUserUsernameChangedPayload {
  userId: string;
  username: string | null;
}

export interface ISocketAuth2faChangedPayload {
  enabled: boolean;
}

export interface ISocketSessionPayload {
  sessionId: string;
}

export interface ISocketUserPresencePayload {
  userId: string;
  lastOnline?: Date | null;
}

export interface ISocketPresenceInitPayload {
  onlineUserIds: string[];
}

export interface ISocketErrorEventPayload {
  event: string;
  message: string;
}

// ─── События Клиент → Сервер ─────────────────────────────────────────────

export interface ISocketEvents {
  /** Application-level heartbeat — клиент проверяет, что соединение живо */
  ping: (data: { ts: number }) => void;

  "profile:subscribe": () => void;

  /** Присоединиться к комнате чата */
  "chat:join": (data: ISocketChatRoomPayload) => void;
  /** Покинуть комнату чата */
  "chat:leave": (data: ISocketChatRoomPayload) => void;
  /** Индикатор набора текста */
  "chat:typing": (data: ISocketChatRoomPayload) => void;
  /** Отметить сообщения как прочитанные */
  "message:read": (data: ISocketMessageReadPayload) => void;
  /** Подтвердить доставку сообщений */
  "message:delivered": (data: ISocketMessageDeliveredPayload) => void;

  // ─── Call (WebRTC signaling) ──────────────────────────────────────────
  /** Relay SDP offer */
  "call:offer": (data: ISocketCallSignalPayload) => void;
  /** Relay SDP answer */
  "call:answer": (data: ISocketCallSignalPayload) => void;
  /** Relay ICE candidate */
  "call:ice-candidate": (data: ISocketCallIceCandidatePayload) => void;
  /** Hangup signal */
  "call:hangup": (data: ISocketCallHangupPayload) => void;
}

// ─── События Сервер → Клиент ─────────────────────────────────────────────

export interface ISocketEmitEvents {
  /** Application-level heartbeat ответ */
  pong: (...args: [{ ts: number }]) => void;

  /** Успешная аутентификация по JWT токену */
  authenticated: (...args: [ISocketAuthenticatedPayload]) => void;
  /** Ошибка аутентификации */
  auth_error: (...args: [ISocketAuthErrorPayload]) => void;

  /** Изменение профиля */
  "profile:updated": (...args: [PublicProfileDto]) => void;

  // ─── Chat events ────────────────────────────────────────────────────────
  /** Новое сообщение */
  "message:new": (...args: [MessageDto]) => void;
  /** Сообщение отредактировано */
  "message:updated": (...args: [MessageDto]) => void;
  /** Сообщение удалено */
  "message:deleted": (...args: [ISocketMessageIdentifierPayload]) => void;
  /** Реакция на сообщение */
  "message:reaction": (...args: [ISocketMessageReactionPayload]) => void;
  /** Сообщение закреплено */
  "message:pinned": (...args: [MessageDto]) => void;
  /** Сообщение откреплено */
  "message:unpinned": (...args: [ISocketMessageIdentifierPayload]) => void;
  /** Обновление статуса доставки сообщения */
  "message:status": (...args: [ISocketMessageStatusPayload]) => void;
  /** Новый чат создан */
  "chat:created": (...args: [ChatDto]) => void;
  /** Чат обновлён */
  "chat:updated": (...args: [ChatDto]) => void;
  /** Кто-то набирает текст */
  "chat:typing": (...args: [ISocketChatTypingPayload]) => void;
  /** Обновление счётчика непрочитанных */
  "chat:unread": (...args: [ISocketChatUnreadPayload]) => void;
  /** Участник добавлен */
  "chat:member:joined": (...args: [ISocketChatMemberPayload]) => void;
  /** Участник удалён */
  "chat:member:left": (...args: [ISocketChatMemberPayload]) => void;
  /** Чат закреплён/откреплён */
  "chat:pinned": (...args: [ISocketChatPinnedPayload]) => void;
  /** Роль участника чата изменена */
  "chat:member:role-changed": (
    ...args: [ISocketChatMemberRoleChangedPayload]
  ) => void;
  /** Обновление последнего сообщения чата */
  "chat:last-message": (...args: [ISocketChatLastMessagePayload]) => void;

  // ─── Poll events ──────────────────────────────────────────────────────
  /** Голос в опросе */
  "poll:voted": (...args: [PollDto]) => void;
  /** Опрос закрыт */
  "poll:closed": (...args: [PollDto]) => void;

  // ─── Chat moderation events ──────────────────────────────────────────
  /** Режим медленной отправки изменён */
  "chat:slow-mode": (...args: [ISocketChatSlowModePayload]) => void;
  /** Участник заблокирован */
  "chat:member:banned": (...args: [ISocketChatMemberBannedPayload]) => void;
  /** Участник разблокирован */
  "chat:member:unbanned": (...args: [ISocketChatMemberPayload]) => void;

  // ─── Call events ─────────────────────────────────────────────────────
  /** Входящий звонок */
  "call:incoming": (...args: [CallDto]) => void;
  /** Звонок принят */
  "call:answered": (...args: [CallDto]) => void;
  /** Звонок отклонён */
  "call:declined": (...args: [CallDto]) => void;
  /** Звонок завершён */
  "call:ended": (...args: [CallDto | ISocketCallEndedPayload]) => void;
  /** Пропущенный звонок */
  "call:missed": (...args: [CallDto]) => void;
  /** Relay SDP offer */
  "call:offer": (...args: [ISocketCallRelayPayload]) => void;
  /** Relay SDP answer */
  "call:answer": (...args: [ISocketCallRelayPayload]) => void;
  /** Relay ICE candidate */
  "call:ice-candidate": (
    ...args: [ISocketCallIceCandidateRelayPayload]
  ) => void;

  // ─── User events ──────────────────────────────────────────────────────
  /** Email пользователя подтверждён */
  "user:email-verified": (...args: [ISocketUserEmailVerifiedPayload]) => void;
  /** Пароль изменён */
  "user:password-changed": (
    ...args: [ISocketUserPasswordChangedPayload]
  ) => void;
  /** Привилегии пользователя изменены */
  "user:privileges-changed": (
    ...args: [ISocketUserPrivilegesChangedPayload]
  ) => void;
  /** Username пользователя изменён */
  "user:username-changed": (
    ...args: [ISocketUserUsernameChangedPayload]
  ) => void;
  /** Пользователь вышел в онлайн */
  "user:online": (...args: [ISocketUserPresencePayload]) => void;
  /** Пользователь ушёл в оффлайн */
  "user:offline": (...args: [ISocketUserPresencePayload]) => void;
  /** Начальный список онлайн-пользователей при подключении */
  "presence:init": (...args: [ISocketPresenceInitPayload]) => void;

  // ─── Sync events ───────────────────────────────────────────────────────
  /** Уведомление о наличии новых изменений для sync */
  "sync:available": (...args: [ISocketSyncAvailablePayload]) => void;

  // ─── Contact events ─────────────────────────────────────────────────────
  /** Запрос на добавление в контакты */
  "contact:request": (...args: [ContactDto]) => void;
  /** Контакт принят */
  "contact:accepted": (...args: [ContactDto]) => void;
  /** Контакт удалён */
  "contact:removed": (...args: [ISocketContactRemovedPayload]) => void;
  /** Контакт заблокирован */
  "contact:blocked": (...args: [ContactDto]) => void;
  /** Контакт разблокирован */
  "contact:unblocked": (...args: [ContactDto]) => void;

  // ─── Push events ──────────────────────────────────────────────────────
  /** Настройки уведомлений изменены */
  "push:settings-changed": (...args: [Record<string, never>]) => void;

  // ─── Profile privacy events ───────────────────────────────────────────
  /** Настройки приватности изменены */
  "profile:privacy-changed": (...args: [Record<string, never>]) => void;

  // ─── Auth events ──────────────────────────────────────────────────────
  /** Изменение статуса 2FA */
  "auth:2fa-changed": (...args: [ISocketAuth2faChangedPayload]) => void;

  // ─── Session events ─────────────────────────────────────────────────────
  /** Новая сессия авторизована */
  "session:new": (...args: [ISocketSessionPayload]) => void;
  /** Сессия завершена */
  "session:terminated": (...args: [ISocketSessionPayload]) => void;

  // ─── Error event ──────────────────────────────────────────────────────
  /** Общая ошибка обработки socket-события */
  error: (...args: [ISocketErrorEventPayload]) => void;
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
