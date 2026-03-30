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

export interface IChatRoomPayload {
  chatId: string;
}

export interface IMessageReadPayload {
  chatId: string;
  messageId: string;
}

export interface IMessageDeliveredPayload {
  chatId: string;
  messageIds: string[];
}

export interface ICallSignalPayload {
  callId: string;
  targetUserId: string;
  sdp: unknown;
}

export interface ICallIceCandidatePayload {
  callId: string;
  targetUserId: string;
  candidate: unknown;
}

export interface ICallHangupPayload {
  callId: string;
  targetUserId: string;
}

// ─── Payload-интерфейсы: Сервер → Клиент ─────────────────────────────────

export interface IAuthenticatedPayload {
  userId: string;
}

export interface IAuthErrorPayload {
  message: string;
}

export interface IMessageIdentifierPayload {
  messageId: string;
  chatId: string;
}

export interface IMessageReactionPayload {
  messageId: string;
  chatId: string;
  userId: string;
  emoji: string | null;
}

export interface IMessageStatusPayload {
  messageId: string;
  chatId: string;
  status: string;
}

export interface IChatTypingPayload {
  chatId: string;
  userId: string;
}

export interface IChatUnreadPayload {
  chatId: string;
  unreadCount: number;
}

export interface IChatMemberPayload {
  chatId: string;
  userId: string;
}

export interface IChatPinnedPayload {
  chatId: string;
  isPinned: boolean;
}

export interface IChatMemberRoleChangedPayload {
  chatId: string;
  userId: string;
  role: string;
}

export interface IChatLastMessagePayload {
  chatId: string;
  lastMessage: ChatLastMessageDto | null;
}

export interface IChatSlowModePayload {
  chatId: string;
  seconds: number;
}

export interface IChatMemberBannedPayload {
  chatId: string;
  userId: string;
  bannedBy: string;
  reason?: string;
}

export interface ICallEndedPayload {
  callId: string;
  endedBy: string;
}

export interface ICallRelayPayload {
  callId: string;
  fromUserId: string;
  sdp: unknown;
}

export interface ICallIceCandidateRelayPayload {
  callId: string;
  fromUserId: string;
  candidate: unknown;
}

export interface IUserEmailVerifiedPayload {
  verified: boolean;
}

export interface ISyncAvailablePayload {
  version: string;
}

export interface IContactRemovedPayload {
  contactId: string;
}

export interface IUserPasswordChangedPayload {
  userId: string;
  method: "change" | "reset";
}

export interface IUserPrivilegesChangedPayload {
  roles: string[];
  permissions: string[];
}

export interface IUserUsernameChangedPayload {
  userId: string;
  username: string | null;
}

export interface IAuth2faChangedPayload {
  enabled: boolean;
}

export interface ISessionPayload {
  sessionId: string;
}

export interface ISocketErrorPayload {
  event: string;
  message: string;
}

// ─── События Клиент → Сервер ─────────────────────────────────────────────

export interface ISocketEvents {
  "profile:subscribe": () => void;

  /** Присоединиться к комнате чата */
  "chat:join": (data: IChatRoomPayload) => void;
  /** Покинуть комнату чата */
  "chat:leave": (data: IChatRoomPayload) => void;
  /** Индикатор набора текста */
  "chat:typing": (data: IChatRoomPayload) => void;
  /** Отметить сообщения как прочитанные */
  "message:read": (data: IMessageReadPayload) => void;
  /** Подтвердить доставку сообщений */
  "message:delivered": (data: IMessageDeliveredPayload) => void;

  // ─── Call (WebRTC signaling) ──────────────────────────────────────────
  /** Relay SDP offer */
  "call:offer": (data: ICallSignalPayload) => void;
  /** Relay SDP answer */
  "call:answer": (data: ICallSignalPayload) => void;
  /** Relay ICE candidate */
  "call:ice-candidate": (data: ICallIceCandidatePayload) => void;
  /** Hangup signal */
  "call:hangup": (data: ICallHangupPayload) => void;
}

// ─── События Сервер → Клиент ─────────────────────────────────────────────

export interface ISocketEmitEvents {
  /** Успешная аутентификация по JWT токену */
  authenticated: (...args: [IAuthenticatedPayload]) => void;
  /** Ошибка аутентификации */
  auth_error: (...args: [IAuthErrorPayload]) => void;

  /** Изменение профиля */
  "profile:updated": (...args: [PublicProfileDto]) => void;

  // ─── Chat events ────────────────────────────────────────────────────────
  /** Новое сообщение */
  "message:new": (...args: [MessageDto]) => void;
  /** Сообщение отредактировано */
  "message:updated": (...args: [MessageDto]) => void;
  /** Сообщение удалено */
  "message:deleted": (...args: [IMessageIdentifierPayload]) => void;
  /** Реакция на сообщение */
  "message:reaction": (...args: [IMessageReactionPayload]) => void;
  /** Сообщение закреплено */
  "message:pinned": (...args: [MessageDto]) => void;
  /** Сообщение откреплено */
  "message:unpinned": (...args: [IMessageIdentifierPayload]) => void;
  /** Обновление статуса доставки сообщения */
  "message:status": (...args: [IMessageStatusPayload]) => void;
  /** Новый чат создан */
  "chat:created": (...args: [ChatDto]) => void;
  /** Чат обновлён */
  "chat:updated": (...args: [ChatDto]) => void;
  /** Кто-то набирает текст */
  "chat:typing": (...args: [IChatTypingPayload]) => void;
  /** Обновление счётчика непрочитанных */
  "chat:unread": (...args: [IChatUnreadPayload]) => void;
  /** Участник добавлен */
  "chat:member:joined": (...args: [IChatMemberPayload]) => void;
  /** Участник удалён */
  "chat:member:left": (...args: [IChatMemberPayload]) => void;
  /** Чат закреплён/откреплён */
  "chat:pinned": (...args: [IChatPinnedPayload]) => void;
  /** Роль участника чата изменена */
  "chat:member:role-changed": (...args: [IChatMemberRoleChangedPayload]) => void;
  /** Обновление последнего сообщения чата */
  "chat:last-message": (...args: [IChatLastMessagePayload]) => void;

  // ─── Poll events ──────────────────────────────────────────────────────
  /** Голос в опросе */
  "poll:voted": (...args: [PollDto]) => void;
  /** Опрос закрыт */
  "poll:closed": (...args: [PollDto]) => void;

  // ─── Chat moderation events ──────────────────────────────────────────
  /** Режим медленной отправки изменён */
  "chat:slow-mode": (...args: [IChatSlowModePayload]) => void;
  /** Участник заблокирован */
  "chat:member:banned": (...args: [IChatMemberBannedPayload]) => void;
  /** Участник разблокирован */
  "chat:member:unbanned": (...args: [IChatMemberPayload]) => void;

  // ─── Call events ─────────────────────────────────────────────────────
  /** Входящий звонок */
  "call:incoming": (...args: [CallDto]) => void;
  /** Звонок принят */
  "call:answered": (...args: [CallDto]) => void;
  /** Звонок отклонён */
  "call:declined": (...args: [CallDto]) => void;
  /** Звонок завершён */
  "call:ended": (...args: [CallDto | ICallEndedPayload]) => void;
  /** Пропущенный звонок */
  "call:missed": (...args: [CallDto]) => void;
  /** Relay SDP offer */
  "call:offer": (...args: [ICallRelayPayload]) => void;
  /** Relay SDP answer */
  "call:answer": (...args: [ICallRelayPayload]) => void;
  /** Relay ICE candidate */
  "call:ice-candidate": (...args: [ICallIceCandidateRelayPayload]) => void;

  // ─── User events ──────────────────────────────────────────────────────
  /** Email пользователя подтверждён */
  "user:email-verified": (...args: [IUserEmailVerifiedPayload]) => void;
  /** Пароль изменён */
  "user:password-changed": (...args: [IUserPasswordChangedPayload]) => void;
  /** Привилегии пользователя изменены */
  "user:privileges-changed": (...args: [IUserPrivilegesChangedPayload]) => void;
  /** Username пользователя изменён */
  "user:username-changed": (...args: [IUserUsernameChangedPayload]) => void;

  // ─── Sync events ───────────────────────────────────────────────────────
  /** Уведомление о наличии новых изменений для sync */
  "sync:available": (...args: [ISyncAvailablePayload]) => void;

  // ─── Contact events ─────────────────────────────────────────────────────
  /** Запрос на добавление в контакты */
  "contact:request": (...args: [ContactDto]) => void;
  /** Контакт принят */
  "contact:accepted": (...args: [ContactDto]) => void;
  /** Контакт удалён */
  "contact:removed": (...args: [IContactRemovedPayload]) => void;
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
  "auth:2fa-changed": (...args: [IAuth2faChangedPayload]) => void;

  // ─── Session events ─────────────────────────────────────────────────────
  /** Новая сессия авторизована */
  "session:new": (...args: [ISessionPayload]) => void;
  /** Сессия завершена */
  "session:terminated": (...args: [ISessionPayload]) => void;

  // ─── Error event ──────────────────────────────────────────────────────
  /** Общая ошибка обработки socket-события */
  error: (...args: [ISocketErrorPayload]) => void;
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
