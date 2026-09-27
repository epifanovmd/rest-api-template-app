import { ContactDto } from "../dto/contact.dto";

export class ContactAcceptedEvent {
  constructor(
    public readonly contact: ContactDto,
    public readonly requesterId: string,
  ) {}
}
