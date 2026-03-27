import { ContactDto } from "../dto/contact.dto";

export class ContactBlockedEvent {
  constructor(
    public readonly contact: ContactDto,
    public readonly blockedUserId: string,
  ) {}
}
