import { Message } from "../../message/message.entity";
import { Poll } from "../poll.entity";

export class PollCreatedEvent {
  constructor(
    public readonly poll: Poll,
    public readonly message: Message,
    public readonly chatId: string,
    public readonly memberUserIds: string[],
  ) {}
}
