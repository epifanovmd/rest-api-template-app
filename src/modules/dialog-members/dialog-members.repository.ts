import { inject, injectable } from "inversify";
import { DataSource, In, Repository } from "typeorm";

import { Injectable } from "../../core";
import { DialogMembers } from "./dialog-members.entity";

@Injectable()
export class DialogMembersRepository {
  private repository: Repository<DialogMembers>;

  constructor(@inject("DataSource") private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(DialogMembers);
  }

  async findByDialogId(dialogId: string): Promise<DialogMembers[]> {
    return this.repository.find({
      where: { dialogId },
      relations: { user: true, dialog: true },
    });
  }

  async findById(id: string): Promise<DialogMembers | null> {
    return this.repository.findOne({
      where: { id },
      relations: { user: true, dialog: true },
    });
  }

  async findByUserId(userId: string): Promise<DialogMembers[]> {
    return this.repository.find({
      where: { userId },
      relations: { user: true, dialog: true },
    });
  }

  async findByUserIdAndDialogId(
    userId: string,
    dialogId: string,
  ): Promise<DialogMembers | null> {
    return this.repository.findOne({
      where: { userId, dialogId },
      relations: { user: true, dialog: true },
    });
  }

  async create(memberData: Partial<DialogMembers>): Promise<DialogMembers> {
    const member = this.repository.create(memberData);

    return this.repository.save(member);
  }

  async createMany(
    membersData: Partial<DialogMembers>[],
  ): Promise<DialogMembers[]> {
    const members = this.repository.create(membersData);

    return this.repository.save(members);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);

    return (result.affected || 0) > 0;
  }

  async deleteByDialogIdAndUserId(
    dialogId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.repository.delete({ dialogId, userId });

    return (result.affected || 0) > 0;
  }

  async save(member: DialogMembers): Promise<DialogMembers> {
    return this.repository.save(member);
  }
}
