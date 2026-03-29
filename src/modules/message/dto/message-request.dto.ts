import { EMessageType } from "../message.types";

export interface ISendMessageBody {
  type?: EMessageType;
  content?: string;
  replyToId?: string;
  forwardedFromId?: string;
  fileIds?: string[];
  mentionedUserIds?: string[];
  mentionAll?: boolean;
}

export interface IMarkReadBody {
  messageId: string;
}

export interface IEditMessageBody {
  content: string;
}

export interface IAddReactionBody {
  emoji: string;
}
