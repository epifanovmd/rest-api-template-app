import { ContactDto } from "../dto/contact.dto";

export class ContactRequestEvent {
  constructor(
    public readonly contact: ContactDto,
    public readonly targetUserId: string,
  ) {}
}
