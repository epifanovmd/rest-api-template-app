import { inject, injectable } from "inversify";
import { DataSource, FindOptionsWhere, Repository } from "typeorm";

import { Injectable } from "../../core";
import { DialogMessages } from "./dialog-messages.entity";

@Injectable()
export class DialogMessagesRepository {
  private repository: Repository<DialogMessages>;

  constructor(@inject("DataSource") private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(DialogMessages);
  }

  async findById(id: string, relations?: any): Promise<DialogMessages | null> {
    return this.repository.findOne({
      where: { id },
      relations,
    });
  }

  async findByDialogId(
    dialogId: string,
    offset?: number,
    limit?: number,
    relations?: any,
  ): Promise<[DialogMessages[], number]> {
    return this.repository.findAndCount({
      where: { dialogId },
      skip: offset,
      take: limit,
      order: { createdAt: "DESC" },
      relations,
    });
  }

  async findLastByDialogId(dialogId: string): Promise<DialogMessages | null> {
    return this.repository.findOne({
      where: { dialogId },
      order: { createdAt: "DESC" },
    });
  }

  async create(messageData: Partial<DialogMessages>): Promise<DialogMessages> {
    const message = this.repository.create(messageData);

    return this.repository.save(message);
  }

  async update(
    id: string,
    updateData: Partial<DialogMessages>,
  ): Promise<DialogMessages | null> {
    await this.repository.update(id, updateData);

    return this.findById(id, {
      user: true,
      dialog: true,
      reply: true,
      images: true,
      videos: true,
      audios: true,
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);

    return (result.affected || 0) > 0;
  }

  async countUnreadMessages(
    userId: string,
    dialogId?: string,
  ): Promise<number> {
    const where: FindOptionsWhere<DialogMessages> = {
      received: false,
      user: { id: userId },
    };

    if (dialogId) {
      where.dialogId = dialogId;
    }

    return this.repository.count({ where });
  }

  async save(message: DialogMessages): Promise<DialogMessages> {
    return this.repository.save(message);
  }
}
