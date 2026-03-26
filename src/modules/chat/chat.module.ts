import { Module } from "../../core";
import { asSocketHandler, asSocketListener } from "../socket";
import { ChatController } from "./chat.controller";
import { ChatHandler } from "./chat.handler";
import { ChatListener } from "./chat.listener";
import { ChatRepository } from "./chat.repository";
import { ChatService } from "./chat.service";
import { ChatMemberRepository } from "./chat-member.repository";

@Module({
  providers: [
    ChatRepository,
    ChatMemberRepository,
    ChatService,
    ChatController,
    asSocketHandler(ChatHandler),
    asSocketListener(ChatListener),
  ],
})
export class ChatModule {}
