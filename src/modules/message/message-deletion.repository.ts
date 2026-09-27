import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { MessageDeletion } from "./message-deletion.entity";

@InjectableRepository(MessageDeletion)
export class MessageDeletionRepository extends BaseRepository<MessageDeletion> {
  async deleteForUser(messageId: string, userId: string): Promise<void> {
    await this.createQueryBuilder()
      .insert()
      .into(MessageDeletion)
      .values({ messageId, userId })
      .orIgnore()
      .execute();
  }
}
