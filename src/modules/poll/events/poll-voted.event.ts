import { Poll } from "../poll.entity";

export class PollVotedEvent {
  constructor(
    public readonly poll: Poll,
    public readonly chatId: string,
    public readonly userId: string,
  ) {}
}
