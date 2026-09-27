import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { PollController } from "./poll.controller";
import { Poll } from "./poll.entity";
import { PollListener } from "./poll.listener";
import { PollRepository } from "./poll.repository";
import { PollService } from "./poll.service";
import { PollChatController } from "./poll-chat.controller";
import { PollOption } from "./poll-option.entity";
import { PollOptionRepository } from "./poll-option.repository";
import { PollVote } from "./poll-vote.entity";
import { PollVoteRepository } from "./poll-vote.repository";

@Module({
  entities: [Poll, PollOption, PollVote],
  providers: [
    PollRepository,
    PollOptionRepository,
    PollVoteRepository,
    PollService,
    PollController,
    PollChatController,
    asSocketListener(PollListener),
  ],
})
export class PollModule {}
