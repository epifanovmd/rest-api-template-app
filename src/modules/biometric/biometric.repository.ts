import { Repository } from "typeorm";

import { IDataSource, Injectable } from "../../core";
import { Biometric } from "./biometric.entity";

@Injectable()
export class BiometricRepository {
  private repository: Repository<Biometric>;

  constructor(@IDataSource() private dataSource: IDataSource) {
    this.repository = this.dataSource.getRepository(Biometric);
  }

  async findById(id: string): Promise<Biometric | null> {
    return this.repository.findOne({
      where: { id },
      relations: { user: true },
    });
  }

  async findByUserId(userId: string): Promise<Biometric[]> {
    return this.repository.find({
      where: { userId },
      relations: { user: true },
    });
  }

  async findByUserIdAndDeviceId(
    userId: string,
    deviceId: string,
  ): Promise<Biometric | null> {
    return this.repository.findOne({
      where: {
        userId,
        deviceId,
      },
      relations: { user: true },
    });
  }

  async create(biometricData: Partial<Biometric>): Promise<Biometric> {
    const biometric = this.repository.create(biometricData);

    return this.repository.save(biometric);
  }

  async upsert(biometricData: Partial<Biometric>): Promise<Biometric> {
    const biometric = this.repository.create(biometricData);

    return this.repository.save(biometric, { reload: false });
  }

  async update(
    id: string,
    updateData: Partial<Biometric>,
  ): Promise<Biometric | null> {
    await this.repository.update(id, updateData);

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);

    return (result.affected || 0) > 0;
  }

  async save(biometric: Biometric): Promise<Biometric> {
    return this.repository.save(biometric);
  }
}
