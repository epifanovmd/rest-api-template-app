import { Repository } from "typeorm";

import { IDataSource, Injectable } from "../../core";
import { Dialog } from "./dialog.entity";

@Injectable()
export class DialogRepository {
  private repository: Repository<Dialog>;

  constructor(@IDataSource() private dataSource: IDataSource) {
    this.repository = this.dataSource.getRepository(Dialog);
  }

  async findById(id: string, relations?: any): Promise<Dialog | null> {
    return this.repository.findOne({
      where: { id },
      relations,
    });
  }

  async findByOwnerId(ownerId: string): Promise<Dialog[]> {
    return this.repository.find({
      where: { ownerId },
      relations: {
        owner: true,
        members: { user: true },
        messages: true,
      },
    });
  }

  async create(dialogData: Partial<Dialog>): Promise<Dialog> {
    const dialog = this.repository.create(dialogData);

    return this.repository.save(dialog);
  }

  async update(
    id: string,
    updateData: Partial<Dialog>,
  ): Promise<Dialog | null> {
    await this.repository.update(id, updateData);

    return this.findById(id, {
      owner: true,
      members: { user: true },
      messages: true,
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);

    return (result.affected || 0) > 0;
  }

  async save(dialog: Dialog): Promise<Dialog> {
    return this.repository.save(dialog);
  }
}
