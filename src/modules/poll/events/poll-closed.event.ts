import { Poll } from "../poll.entity";

export class PollClosedEvent {
  constructor(
    public readonly poll: Poll,
    public readonly chatId: string,
    public readonly userId: string,
  ) {}
}
