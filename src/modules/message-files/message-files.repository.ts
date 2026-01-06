import { In } from "typeorm";

import { BaseRepository, InjectableRepository } from "../../core";
import { MessageFiles, TMessageFileType } from "./message-files.entity";

@InjectableRepository(MessageFiles)
export class MessageFilesRepository extends BaseRepository<MessageFiles> {
  async findByMessageId(messageId: string): Promise<MessageFiles[]> {
    return this.find({
      where: { messageId },
      relations: {
        file: true,
        message: true,
      },
    });
  }

  async findByFileType(
    messageId: string,
    fileType: TMessageFileType,
  ): Promise<MessageFiles[]> {
    return this.find({
      where: {
        messageId,
        fileType,
      },
      relations: { file: true },
    });
  }

  async deleteByMessageIdAndFileIds(
    messageId: string,
    fileIds: string[],
  ): Promise<boolean> {
    const result = await this.delete({
      messageId,
      fileId: In(fileIds),
    });

    return (result.affected || 0) > 0;
  }
}
