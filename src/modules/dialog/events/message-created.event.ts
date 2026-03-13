import { DialogMessagesDto } from "../../dialog-messages/dto";

export class MessageCreatedEvent {
  constructor(
    public readonly message: DialogMessagesDto,
    public readonly recipientIds: string[],
  ) {}
}
