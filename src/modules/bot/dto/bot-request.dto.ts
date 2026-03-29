import { EMessageType } from "../../message/message.types";
import { WebhookLogDto } from "./bot.dto";

export interface ICreateBotBody {
  username: string;
  displayName: string;
  description?: string;
}

export interface IUpdateBotBody {
  displayName?: string;
  description?: string | null;
  avatarId?: string | null;
}

export interface ISetWebhookBody {
  url: string;
  secret?: string;
}

export interface ISetWebhookEventsBody {
  events: string[];
}

export interface ISetCommandsBody {
  commands: { command: string; description: string }[];
}

export interface IWebhookLogsResponse {
  data: WebhookLogDto[];
  totalCount: number;
}

export interface IWebhookTestResponse {
  success: boolean;
  statusCode: number | null;
  errorMessage: string | null;
  durationMs: number;
}

export interface IBotSendMessageBody {
  chatId: string;
  content?: string;
  type?: EMessageType;
  replyToId?: string;
  fileIds?: string[];
}

export interface IBotEditMessageBody {
  content: string;
}
