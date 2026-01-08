import { FindOptionsRelations, FindOptionsWhere, Not } from "typeorm";

import { BaseRepository, InjectableRepository } from "../../core";
import { DialogMessages } from "./dialog-messages.entity";

@InjectableRepository(DialogMessages)
export class DialogMessagesRepository extends BaseRepository<DialogMessages> {
  async findById(
    id: string,
    relations?: FindOptionsRelations<DialogMessages>,
  ): Promise<DialogMessages | null> {
    return this.findOne({
      where: { id },
      relations,
    });
  }

  async findByDialogId(
    dialogId: string,
    offset?: number,
    limit?: number,
    relations?: FindOptionsRelations<DialogMessages>,
  ): Promise<[DialogMessages[], number]> {
    return this.findAndCount({
      where: { dialogId },
      skip: offset,
      take: limit,
      order: { createdAt: "DESC" },
      relations,
    });
  }

  async findLastByDialogId(
    dialogId: string,
    relations?: FindOptionsRelations<DialogMessages>,
  ): Promise<DialogMessages | null> {
    return this.findOne({
      where: { dialogId },
      order: { createdAt: "DESC" },
      relations,
    });
  }

  async countUnreadMessages(
    userId: string,
    dialogId?: string,
  ): Promise<number> {
    const where: FindOptionsWhere<DialogMessages> = {
      received: false,
      user: { id: Not(userId) },
      dialog: {
        members: {
          userId,
        },
      },
    };

    if (dialogId) {
      where.dialogId = dialogId;
    }

    return this.count({ where });
  }
}
