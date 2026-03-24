import { BaseRepository, InjectableRepository } from "../../core";
import { Otp } from "./otp.entity";

/** Репозиторий для работы с одноразовыми паролями (OTP). */
@InjectableRepository(Otp)
export class OtpRepository extends BaseRepository<Otp> {
  /** Найти OTP-запись по идентификатору пользователя. */
  async findByUserId(userId: string): Promise<Otp | null> {
    return this.findOne({ where: { userId } });
  }

  /** Найти OTP-запись по идентификатору пользователя и коду. */
  async findByUserIdAndCode(userId: string, code: string): Promise<Otp | null> {
    return this.findOne({
      where: {
        userId,
        code,
      },
    });
  }
}
