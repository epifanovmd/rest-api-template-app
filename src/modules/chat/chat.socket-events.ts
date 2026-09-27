/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type {
  ChatDto,
  ChatLastMessageDto,
  ChatMemberPublicDto,
} from "./dto/chat.dto";

export interface ISocketChatRoomPayload {
  chatId: string;
}

export interface ISocketTypingRoomsPayload {
  chatIds: string[];
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

export interface ISocketChatMemberJoinedPayload {
  chatId: string;
  userId: string;
  member?: ChatMemberPublicDto;
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

declare module "../socket/socket.types" {
  interface ISocketEvents {
    /** Присоединиться к комнате чата */
    "chat:join": (data: ISocketChatRoomPayload) => void;
    /** Покинуть комнату чата */
    "chat:leave": (data: ISocketChatRoomPayload) => void;
    /** Индикатор набора текста */
    "chat:typing": (data: ISocketChatRoomPayload) => void;
    /** Подписаться на typing-комнаты (лёгкие, для списка чатов) */
    "typing:subscribe": (data: ISocketTypingRoomsPayload) => void;
    /** Отписаться от typing-комнат */
    "typing:unsubscribe": (data: ISocketTypingRoomsPayload) => void;
  }

  interface ISocketEmitEvents {
    /** Новый чат создан */
    "chat:created": (...args: [ChatDto]) => void;
    /** Чат обновлён */
    "chat:updated": (...args: [ChatDto]) => void;
    /** Кто-то набирает текст */
    "chat:typing": (...args: [ISocketChatTypingPayload]) => void;
    /** Обновление счётчика непрочитанных */
    "chat:unread": (...args: [ISocketChatUnreadPayload]) => void;
    /** Участник добавлен */
    "chat:member:joined": (...args: [ISocketChatMemberJoinedPayload]) => void;
    /** Участник удалён */
    "chat:member:left": (...args: [ISocketChatMemberPayload]) => void;
    "chat:deleted": (...args: [{ chatId: string }]) => void;
    /** Чат закреплён/откреплён */
    "chat:pinned": (...args: [ISocketChatPinnedPayload]) => void;
    /** Роль участника чата изменена */
    "chat:member:role-changed": (
      ...args: [ISocketChatMemberRoleChangedPayload]
    ) => void;
    /** Обновление последнего сообщения чата */
    "chat:last-message": (...args: [ISocketChatLastMessagePayload]) => void;
    /** Режим медленной отправки изменён */
    "chat:slow-mode": (...args: [ISocketChatSlowModePayload]) => void;
    /** Участник заблокирован */
    "chat:member:banned": (...args: [ISocketChatMemberBannedPayload]) => void;
    /** Участник разблокирован */
    "chat:member:unbanned": (...args: [ISocketChatMemberPayload]) => void;
  }
}
