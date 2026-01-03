import { Repository } from "typeorm";

import { IDataSource, Injectable } from "../../core";
import { Passkey } from "./passkey.entity";

@Injectable()
export class PasskeyRepository {
  private repository: Repository<Passkey>;

  constructor(@IDataSource() private dataSource: IDataSource) {
    this.repository = this.dataSource.getRepository(Passkey);
  }

  async findById(id: string): Promise<Passkey | null> {
    return this.repository.findOne({
      where: { id },
      relations: { user: true },
    });
  }

  async findByUserId(userId: string): Promise<Passkey[]> {
    return this.repository.find({
      where: { userId },
      relations: { user: true },
    });
  }

  async findByUserIdAndId(userId: string, id: string): Promise<Passkey | null> {
    return this.repository.findOne({
      where: {
        userId,
        id,
      },
      relations: { user: true },
    });
  }

  async create(passkeyData: Partial<Passkey>): Promise<Passkey> {
    const passkey = this.repository.create(passkeyData);

    return this.repository.save(passkey);
  }

  async update(
    id: string,
    updateData: Partial<Passkey>,
  ): Promise<Passkey | null> {
    await this.repository.update(id, updateData);

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);

    return (result.affected || 0) > 0;
  }

  async save(passkey: Passkey): Promise<Passkey> {
    return this.repository.save(passkey);
  }
}
