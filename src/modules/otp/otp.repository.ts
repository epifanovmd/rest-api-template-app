import { Repository } from "typeorm";

import { IDataSource, Injectable } from "../../core";
import { Otp } from "./otp.entity";

@Injectable()
export class OtpRepository {
  private repository: Repository<Otp>;

  constructor(@IDataSource() private dataSource: IDataSource) {
    this.repository = this.dataSource.getRepository(Otp);
  }

  async findByUserId(userId: string): Promise<Otp | null> {
    return this.repository.findOne({ where: { userId } });
  }

  async findByUserIdAndCode(userId: string, code: string): Promise<Otp | null> {
    return this.repository.findOne({
      where: {
        userId,
        code,
      },
    });
  }

  async create(otpData: Partial<Otp>): Promise<Otp> {
    const otp = this.repository.create(otpData);

    return this.repository.save(otp);
  }

  async delete(userId: string): Promise<boolean> {
    const result = await this.repository.delete({ userId });

    return (result.affected || 0) > 0;
  }

  async save(otp: Otp): Promise<Otp> {
    return this.repository.save(otp);
  }
}
