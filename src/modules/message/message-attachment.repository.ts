import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { MessageAttachment } from "./message-attachment.entity";

@InjectableRepository(MessageAttachment)
export class MessageAttachmentRepository extends BaseRepository<MessageAttachment> {
  async findByMessageId(messageId: string) {
    return this.find({
      where: { messageId },
      relations: { file: true },
    });
  }
}
