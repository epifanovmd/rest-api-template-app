import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { ChatModerationController } from "./chat-moderation.controller";
import { ChatModerationListener } from "./chat-moderation.listener";
import { ChatModerationService } from "./chat-moderation.service";

@Module({
  providers: [
    ChatModerationService,
    ChatModerationController,
    asSocketListener(ChatModerationListener),
  ],
})
export class ChatModerationModule {}
