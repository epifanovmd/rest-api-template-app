import { FindOptionsRelations } from "typeorm";

import { BaseRepository, InjectableRepository } from "../../core";
import { DialogMembers } from "./dialog-members.entity";

@InjectableRepository(DialogMembers)
export class DialogMembersRepository extends BaseRepository<DialogMembers> {
  async findByDialogId(
    dialogId: string,
    relations?: FindOptionsRelations<DialogMembers>,
  ): Promise<DialogMembers[]> {
    return this.find({
      where: { dialogId },
      relations,
    });
  }

  async findById(
    id: string,
    relations?: FindOptionsRelations<DialogMembers>,
  ): Promise<DialogMembers | null> {
    return this.findOne({
      where: { id },
      relations,
    });
  }

  async findByUserId(
    userId: string,
    relations?: FindOptionsRelations<DialogMembers>,
  ) {
    return this.find({
      where: { userId },
      relations,
    });
  }

  async findByUserIdAndDialogId(
    userId: string,
    dialogId: string,
    relations?: FindOptionsRelations<DialogMembers>,
  ) {
    return this.findOne({
      where: {
        userId,
        dialogId,
      },
      relations,
    });
  }
}
