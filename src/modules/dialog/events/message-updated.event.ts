import { DialogMessagesDto } from "../../dialog-messages/dto";

export class MessageUpdatedEvent {
  constructor(
    public readonly message: DialogMessagesDto,
    public readonly memberIds: string[],
  ) {}
}
