import { BaseRepository, InjectableRepository } from "../../core";
import { DialogMembers } from "./dialog-members.entity";

@InjectableRepository(DialogMembers)
export class DialogMembersRepository extends BaseRepository<DialogMembers> {
  async findByDialogId(dialogId: string): Promise<DialogMembers[]> {
    return this.find({
      where: { dialogId },
      relations: {
        user: true,
        dialog: true,
      },
    });
  }

  async findById(id: string): Promise<DialogMembers | null> {
    return this.findOne({
      where: { id },
      relations: {
        user: true,
        dialog: true,
      },
    });
  }

  async findByUserId(userId: string): Promise<DialogMembers[]> {
    return this.find({
      where: { userId },
      relations: {
        user: true,
        dialog: true,
      },
    });
  }

  async findByUserIdAndDialogId(
    userId: string,
    dialogId: string,
  ): Promise<DialogMembers | null> {
    return this.findOne({
      where: {
        userId,
        dialogId,
      },
      relations: {
        user: true,
        dialog: true,
      },
    });
  }
}
