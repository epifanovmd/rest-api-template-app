import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Poll } from "./poll.entity";

@InjectableRepository(Poll)
export class PollRepository extends BaseRepository<Poll> {
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        options: true,
        votes: true,
        message: true,
      },
    });
  }

  async findByMessageId(messageId: string) {
    return this.findOne({
      where: { messageId },
      relations: {
        options: true,
        votes: true,
      },
    });
  }
}
