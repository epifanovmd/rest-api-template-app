import { Chat } from "../chat.entity";

export class ChatLastMessageUpdatedEvent {
  constructor(
    public readonly chat: Chat,
    public readonly memberUserIds: string[],
  ) {}
}
