import { Module } from "../../core";
import { asFileUsageProbe } from "../file";
import { asSocketHandler, asSocketListener } from "../socket";
import { ChatMessageController } from "./chat-message.controller";
import { MessageController } from "./message.controller";
import { Message } from "./message.entity";
import { MessageHandler } from "./message.handler";
import { MessageListener } from "./message.listener";
import { MessageRepository } from "./message.repository";
import { MessageService } from "./message.service";
import { MessageAttachment } from "./message-attachment.entity";
import { MessageAttachmentRepository } from "./message-attachment.repository";
import { MessageDeletion } from "./message-deletion.entity";
import { MessageDeletionRepository } from "./message-deletion.repository";
import { MessageFileUsageProbe } from "./message-file-usage.probe";
import { MessageMention } from "./message-mention.entity";
import { MessageMentionRepository } from "./message-mention.repository";
import { MessageReaction } from "./message-reaction.entity";
import { MessageReactionRepository } from "./message-reaction.repository";
import { MessageReceipt } from "./message-receipt.entity";
import { MessageReceiptRepository } from "./message-receipt.repository";

@Module({
  entities: [
    Message,
    MessageAttachment,
    MessageDeletion,
    MessageReaction,
    MessageReceipt,
    MessageMention,
  ],
  providers: [
    MessageRepository,
    MessageAttachmentRepository,
    MessageDeletionRepository,
    MessageReactionRepository,
    MessageReceiptRepository,
    MessageMentionRepository,
    MessageService,
    ChatMessageController,
    MessageController,
    asSocketHandler(MessageHandler),
    asSocketListener(MessageListener),
    asFileUsageProbe(MessageFileUsageProbe),
  ],
})
export class MessageModule {}
