import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { PollController } from "./poll.controller";
import { PollListener } from "./poll.listener";
import { PollRepository } from "./poll.repository";
import { PollService } from "./poll.service";
import { PollChatController } from "./poll-chat.controller";
import { PollOptionRepository } from "./poll-option.repository";
import { PollVoteRepository } from "./poll-vote.repository";

@Module({
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
