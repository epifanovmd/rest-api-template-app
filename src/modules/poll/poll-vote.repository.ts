import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { PollVote } from "./poll-vote.entity";

@InjectableRepository(PollVote)
export class PollVoteRepository extends BaseRepository<PollVote> {
  async findByPollAndUser(pollId: string, userId: string) {
    return this.find({
      where: { pollId, userId },
    });
  }

  async deleteByPollAndUser(pollId: string, userId: string) {
    return this.delete({ pollId, userId });
  }
}
