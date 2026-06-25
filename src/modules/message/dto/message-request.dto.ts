import { EMessageType } from "../message.types";

export interface ISendMessageBody {
  type?: EMessageType;
  content?: string;
  replyToId?: string;
  forwardedFromId?: string;
  fileIds?: string[];
  mentionedUserIds?: string[];
  mentionAll?: boolean;
  /** Клиентский ID для дедупликации оптимистичных сообщений. Транзитное поле — не сохраняется в БД. */
  localId?: string;
}

export interface IMarkReadBody {
  messageIds: string[];
}

export interface IEditMessageBody {
  content: string;
}

export interface IAddReactionBody {
  emoji: string;
}
