import { Message } from "../message.entity";

export class MessageUpdatedEvent {
  constructor(
    public readonly message: Message,
    public readonly chatId: string,
  ) {}
}
