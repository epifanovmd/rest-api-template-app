import { Chat } from "../chat.entity";

export class ChatUpdatedEvent {
  constructor(public readonly chat: Chat) {}
}
