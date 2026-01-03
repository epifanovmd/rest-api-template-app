import { inject, injectable } from "inversify";
import { DataSource, FindOptionsWhere, Repository } from "typeorm";

import { Injectable } from "../../core";
import { FcmToken } from "./fcm-token.entity";

@Injectable()
export class FcmTokenRepository {
  private repository: Repository<FcmToken>;

  constructor(@inject("DataSource") private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(FcmToken);
  }

  async findById(id: number): Promise<FcmToken | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByUserId(userId: string): Promise<FcmToken[]> {
    return this.repository.find({ where: { userId } });
  }

  async findByToken(token: string): Promise<FcmToken | null> {
    return this.repository.findOne({ where: { token } });
  }

  async create(fcmTokenData: Partial<FcmToken>): Promise<FcmToken> {
    const fcmToken = this.repository.create(fcmTokenData);

    return this.repository.save(fcmToken);
  }

  async update(
    id: number,
    updateData: Partial<FcmToken>,
  ): Promise<FcmToken | null> {
    await this.repository.update(id, updateData);

    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repository.delete(id);

    return (result.affected || 0) > 0;
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const result = await this.repository.delete({ userId });

    return (result.affected || 0) > 0;
  }

  async save(fcmToken: FcmToken): Promise<FcmToken> {
    return this.repository.save(fcmToken);
  }
}
