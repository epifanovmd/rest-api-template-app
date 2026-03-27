import { Module } from "../../core";
import { asSocketHandler, asSocketListener } from "../socket";
import { ChatMessageController } from "./chat-message.controller";
import { MessageController } from "./message.controller";
import { MessageHandler } from "./message.handler";
import { MessageListener } from "./message.listener";
import { MessageRepository } from "./message.repository";
import { MessageService } from "./message.service";
import { MessageAttachmentRepository } from "./message-attachment.repository";
import { MessageMentionRepository } from "./message-mention.repository";
import { MessageReactionRepository } from "./message-reaction.repository";

@Module({
  providers: [
    MessageRepository,
    MessageAttachmentRepository,
    MessageReactionRepository,
    MessageMentionRepository,
    MessageService,
    ChatMessageController,
    MessageController,
    asSocketHandler(MessageHandler),
    asSocketListener(MessageListener),
  ],
})
export class MessageModule {}
