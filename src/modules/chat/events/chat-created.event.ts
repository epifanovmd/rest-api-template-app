import { Chat } from "../chat.entity";

export class ChatCreatedEvent {
  constructor(
    public readonly chat: Chat,
    public readonly memberUserIds: string[],
  ) {}
}
