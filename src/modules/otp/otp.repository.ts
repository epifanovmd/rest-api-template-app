import { BaseRepository, InjectableRepository } from "../../core";
import { Otp } from "./otp.entity";

@InjectableRepository(Otp)
export class OtpRepository extends BaseRepository<Otp> {
  async findByUserId(userId: string): Promise<Otp | null> {
    return this.findOne({ where: { userId } });
  }

  async findByUserIdAndCode(userId: string, code: string): Promise<Otp | null> {
    return this.findOne({
      where: {
        userId,
        code,
      },
    });
  }
}
