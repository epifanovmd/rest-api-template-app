import { ContactDto } from "../dto/contact.dto";

export class ContactUnblockedEvent {
  constructor(
    public readonly contact: ContactDto,
    public readonly unblockedUserId: string,
  ) {}
}
