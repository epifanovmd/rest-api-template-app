import type { PollDto } from "../../poll/dto/poll.dto";
import { Message } from "../message.entity";

export class MessageCreatedEvent {
  constructor(
    public readonly message: Message,
    public readonly chatId: string,
    public readonly memberUserIds: string[],
    public readonly mentionedUserIds: string[] = [],
    public readonly mentionAll: boolean = false,
    public readonly localId?: string,
    /** Опрос для сообщения типа POLL — уходит клиентам вместе с message:new. */
    public readonly poll?: PollDto,
  ) {}
}
