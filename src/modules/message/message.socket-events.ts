/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
import type { ISocketAckResponse } from "../socket";
import type { MessageDto } from "./dto/message.dto";

export interface ISocketMessageReadPayload {
  chatId: string;
  messageIds: string[];
  /** @deprecated use messageIds */
  messageId?: string;
}

export interface ISocketMessageDeliveredPayload {
  chatId: string;
  messageIds: string[];
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
  /** ID пользователя, изменившего статус (для per-user tracking в группах) */
  userId?: string;
  /** Агрегированная информация о receipts (для отправителя в группах) */
  receiptSummary?: {
    delivered: number;
    read: number;
    total: number;
  };
}

declare module "../socket/socket.types" {
  interface ISocketEvents {
    /** Отметить сообщения как прочитанные (с ack-подтверждением) */
    "message:read": (
      data: ISocketMessageReadPayload,
      ack?: (response: ISocketAckResponse) => void,
    ) => void;
    /** Подтвердить доставку сообщений (с ack-подтверждением) */
    "message:delivered": (
      data: ISocketMessageDeliveredPayload,
      ack?: (response: ISocketAckResponse) => void,
    ) => void;
  }

  interface ISocketEmitEvents {
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
  }
}
