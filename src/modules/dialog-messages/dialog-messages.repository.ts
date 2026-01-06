import { FindOptionsWhere } from "typeorm";

import { BaseRepository, InjectableRepository } from "../../core";
import { DialogMessages } from "./dialog-messages.entity";

@InjectableRepository(DialogMessages)
export class DialogMessagesRepository extends BaseRepository<DialogMessages> {
  async findById(id: string, relations?: any): Promise<DialogMessages | null> {
    return this.findOne({
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
    return this.findAndCount({
      where: { dialogId },
      skip: offset,
      take: limit,
      order: { createdAt: "DESC" },
      relations,
    });
  }

  async findLastByDialogId(dialogId: string): Promise<DialogMessages | null> {
    return this.findOne({
      where: { dialogId },
      order: { createdAt: "DESC" },
    });
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

    return this.count({ where });
  }
}
