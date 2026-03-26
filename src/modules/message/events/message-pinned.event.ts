import { Message } from "../message.entity";

export class MessagePinnedEvent {
  constructor(
    public readonly message: Message,
    public readonly chatId: string,
    public readonly pinnedByUserId: string,
  ) {}
}

export class MessageUnpinnedEvent {
  constructor(
    public readonly messageId: string,
    public readonly chatId: string,
  ) {}
}
