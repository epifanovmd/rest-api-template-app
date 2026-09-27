import { Module } from "../../core";
import { asFileUsageProbe } from "../file";
import { asPresenceAudience } from "../profile";
import {
  asSocketHandler,
  asSocketListener,
  asSocketRoomProvider,
} from "../socket";
import { ChatController } from "./chat.controller";
import { Chat } from "./chat.entity";
import { ChatHandler } from "./chat.handler";
import { ChatListener } from "./chat.listener";
import { ChatPresenceAudience } from "./chat.presence-audience";
import { ChatRepository } from "./chat.repository";
import { ChatRoomProvider } from "./chat.room-provider";
import { ChatSeedBootstrap } from "./chat.seed.bootstrap";
import { ChatService } from "./chat.service";
import { ChatAvatarUsageProbe } from "./chat-avatar.probe";
import { ChatBan } from "./chat-ban.entity";
import { ChatBanRepository } from "./chat-ban.repository";
import { ChatFolder } from "./chat-folder.entity";
import { ChatFolderRepository } from "./chat-folder.repository";
import { ChatInvite } from "./chat-invite.entity";
import { ChatInviteRepository } from "./chat-invite.repository";
import { ChatMember } from "./chat-member.entity";
import { ChatMemberRepository } from "./chat-member.repository";

@Module({
  entities: [Chat, ChatMember, ChatInvite, ChatFolder, ChatBan],
  providers: [
    asSocketRoomProvider(ChatRoomProvider),
    asFileUsageProbe(ChatAvatarUsageProbe),
    ChatRepository,
    ChatMemberRepository,
    ChatInviteRepository,
    ChatFolderRepository,
    ChatBanRepository,
    ChatService,
    ChatController,
    asSocketHandler(ChatHandler),
    asSocketListener(ChatListener),
    asPresenceAudience(ChatPresenceAudience),
  ],
  bootstrappers: [ChatSeedBootstrap],
})
export class ChatModule {}
