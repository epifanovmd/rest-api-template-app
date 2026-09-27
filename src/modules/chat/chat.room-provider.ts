import { inject } from "inversify";

import { Injectable } from "../../core";
import type { ISocketRoomProvider } from "../socket";
import { ChatMemberRepository } from "./chat-member.repository";

/** При подключении сокет входит в комнаты всех своих чатов и их «печатает». */
@Injectable()
export class ChatRoomProvider implements ISocketRoomProvider {
  constructor(
    @inject(ChatMemberRepository)
    private readonly _members: ChatMemberRepository,
  ) {}

  async rooms(userId: string): Promise<string[]> {
    const chatIds = await this._members.getUserChatIds(userId);

    return chatIds.flatMap(id => [`chat_${id}`, `typing_${id}`]);
  }
}
