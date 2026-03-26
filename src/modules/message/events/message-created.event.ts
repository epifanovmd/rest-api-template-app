import { Message } from "../message.entity";

export class MessageCreatedEvent {
  constructor(
    public readonly message: Message,
    public readonly chatId: string,
    public readonly memberUserIds: string[],
  ) {}
}
