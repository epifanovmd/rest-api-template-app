import { BadRequestException, GoneException } from "@force-dev/utils";
import { inject } from "inversify";
import moment from "moment";

import { generateOtp } from "../../common";
import { config } from "../../config";
import { Injectable } from "../../core";
import { OtpRepository } from "./otp.repository";

const {
  auth: { otp },
} = config;

/** Сервис для генерации и проверки одноразовых паролей (OTP). */
@Injectable()
export class OtpService {
  constructor(@inject(OtpRepository) private _otpRepository: OtpRepository) {}

  /** Создать или обновить OTP-код для пользователя. */
  async create(userId: string) {
    const code = generateOtp();
    const findOtp = await this._otpRepository.findByUserId(userId);

    const expireAt = moment().add(otp.expireMinutes, "minutes").toDate();

    if (findOtp) {
      findOtp.code = code;
      findOtp.expireAt = expireAt;

      return await this._otpRepository.save(findOtp);
    } else {
      return this._otpRepository.createAndSave({
        userId,
        code,
        expireAt,
      });
    }
  }

  /** Проверить OTP-код пользователя; удаляет запись после успешной проверки. */
  async check(userId: string, code: string) {
    const otp = await this._otpRepository.findByUserIdAndCode(userId, code);

    if (!otp) {
      throw new BadRequestException(
        "Неверный код. Пожалуйста, повторите попытку.",
      );
    }

    if (otp.expireAt < new Date()) {
      await this._otpRepository.delete({ userId });
      throw new GoneException(
        "Срок действия кода истек. Пожалуйста, запросите новый код.",
      );
    }

    await this._otpRepository.delete({ userId });

    return true;
  }
}
