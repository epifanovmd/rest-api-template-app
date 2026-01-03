import { In, Repository } from "typeorm";

import { IDataSource, Injectable } from "../../core";
import { MessageFiles, TMessageFileType } from "./message-files.entity";

@Injectable()
export class MessageFilesRepository {
  private repository: Repository<MessageFiles>;

  constructor(@IDataSource() private dataSource: IDataSource) {
    this.repository = this.dataSource.getRepository(MessageFiles);
  }

  async findByMessageId(messageId: string): Promise<MessageFiles[]> {
    return this.repository.find({
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
    return this.repository.find({
      where: {
        messageId,
        fileType,
      },
      relations: { file: true },
    });
  }

  async create(messageFileData: Partial<MessageFiles>): Promise<MessageFiles> {
    const messageFile = this.repository.create(messageFileData);

    return this.repository.save(messageFile);
  }

  async createMany(
    messageFilesData: Partial<MessageFiles>[],
  ): Promise<MessageFiles[]> {
    const messageFiles = this.repository.create(messageFilesData);

    return this.repository.save(messageFiles);
  }

  async deleteByMessageIdAndFileIds(
    messageId: string,
    fileIds: string[],
  ): Promise<boolean> {
    const result = await this.repository.delete({
      messageId,
      fileId: In(fileIds),
    });

    return (result.affected || 0) > 0;
  }

  async deleteByMessageId(messageId: string): Promise<boolean> {
    const result = await this.repository.delete({ messageId });

    return (result.affected || 0) > 0;
  }
}
