import { ChatMember } from "../chat-member.entity";

export class ChatMemberJoinedEvent {
  constructor(
    public readonly chatId: string,
    public readonly userId: string,
    public readonly memberUserIds: string[],
    public readonly member?: ChatMember,
  ) {}
}
