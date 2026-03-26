import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { MessageMention } from "./message-mention.entity";

@InjectableRepository(MessageMention)
export class MessageMentionRepository extends BaseRepository<MessageMention> {
  async findByMessageId(messageId: string) {
    return this.find({ where: { messageId } });
  }
}
