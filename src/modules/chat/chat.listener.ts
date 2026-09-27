import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { FileUrlService } from "../file";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { UserDeletedEvent } from "../user";
import { Chat } from "./chat.entity";
import { ChatService } from "./chat.service";
import {
  ChatDto,
  ChatLastMessageDto,
  ChatMemberDto,
  collectChatFiles,
  collectChatMemberFiles,
} from "./dto";
import {
  ChatCreatedEvent,
  ChatDeletedEvent,
  ChatLastMessageUpdatedEvent,
  ChatMemberJoinedEvent,
  ChatMemberLeftEvent,
  ChatMemberRoleChangedEvent,
  ChatPinnedEvent,
  ChatUpdatedEvent,
} from "./events";

/** Комнаты сокетов, в которых состоит участник чата. */
const chatRooms = (chatId: string) => [`chat_${chatId}`, `typing_${chatId}`];

@Injectable()
export class ChatListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(ChatService) private readonly _chatService: ChatService,
    @inject(FileUrlService) private readonly _fileUrls: FileUrlService,
  ) {}

  register(): void {
    this._eventBus.on(ChatCreatedEvent, async (event: ChatCreatedEvent) => {
      for (const userId of event.memberUserIds) {
        this.joinChatRooms(userId, event.chat.id);
      }

      const dto = await this.toChatDto(event.chat);

      for (const userId of event.memberUserIds) {
        this._emitter.toUser(userId, "chat:created", dto);
      }
    });

    this._eventBus.on(ChatUpdatedEvent, async (event: ChatUpdatedEvent) => {
      const dto = await this.toChatDto(event.chat);

      this._emitter.toRoom(`chat_${event.chat.id}`, "chat:updated", dto);
    });

    this._eventBus.on(
      ChatMemberJoinedEvent,
      async (event: ChatMemberJoinedEvent) => {
        this.joinChatRooms(event.userId, event.chatId);

        const member = event.member
          ? await this._fileUrls.buildOneWithFiles(
              event.member,
              collectChatMemberFiles,
              ChatMemberDto.fromEntity,
            )
          : undefined;

        for (const userId of event.memberUserIds) {
          this._emitter.toUser(userId, "chat:member:joined", {
            chatId: event.chatId,
            userId: event.userId,
            member,
          });
        }
      },
    );

    this._eventBus.on(ChatMemberLeftEvent, (event: ChatMemberLeftEvent) => {
      this.leaveChatRooms(event.userId, event.chatId);

      for (const userId of event.memberUserIds) {
        this._emitter.toUser(userId, "chat:member:left", {
          chatId: event.chatId,
          userId: event.userId,
        });
      }
    });

    this._eventBus.on(ChatDeletedEvent, (event: ChatDeletedEvent) => {
      for (const userId of event.memberUserIds) {
        this.leaveChatRooms(userId, event.chatId);
        this._emitter.toUser(userId, "chat:deleted", { chatId: event.chatId });
      }
    });

    this._eventBus.on(UserDeletedEvent, (event: UserDeletedEvent) =>
      this._chatService.handleUserDeleted(event.userId),
    );

    this._eventBus.on(ChatPinnedEvent, (event: ChatPinnedEvent) => {
      this._emitter.toUser(event.userId, "chat:pinned", {
        chatId: event.chatId,
        isPinned: event.isPinned,
      });
    });

    this._eventBus.on(
      ChatMemberRoleChangedEvent,
      (event: ChatMemberRoleChangedEvent) => {
        this._emitter.toRoom(
          `chat_${event.chatId}`,
          "chat:member:role-changed",
          {
            chatId: event.chatId,
            userId: event.userId,
            role: event.role,
          },
        );
      },
    );

    this._eventBus.on(
      ChatLastMessageUpdatedEvent,
      (event: ChatLastMessageUpdatedEvent) => {
        const lastMessage = ChatLastMessageDto.fromEntity(event.chat);

        for (const userId of event.memberUserIds) {
          this._emitter.toUser(userId, "chat:last-message", {
            chatId: event.chat.id,
            lastMessage,
          });
        }
      },
    );
  }

  private toChatDto(chat: Chat) {
    return this._fileUrls.buildOneWithFiles(
      chat,
      collectChatFiles,
      (entity, files) => ChatDto.fromEntity(entity, files),
    );
  }

  private joinChatRooms(userId: string, chatId: string) {
    for (const room of chatRooms(chatId)) this._emitter.joinRoom(userId, room);
  }

  private leaveChatRooms(userId: string, chatId: string) {
    for (const room of chatRooms(chatId)) this._emitter.leaveRoom(userId, room);
  }
}
