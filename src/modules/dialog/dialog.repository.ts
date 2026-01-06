import { BaseRepository, InjectableRepository } from "../../core";
import { Dialog } from "./dialog.entity";

@InjectableRepository(Dialog)
export class DialogRepository extends BaseRepository<Dialog> {
  async findById(id: string, relations?: any): Promise<Dialog | null> {
    return this.findOne({
      where: { id },
      relations,
    });
  }

  async findByOwnerId(ownerId: string): Promise<Dialog[]> {
    return this.find({
      where: { ownerId },
      relations: {
        owner: true,
        members: { user: true },
        messages: true,
      },
    });
  }
}
