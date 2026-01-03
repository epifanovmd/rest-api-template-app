import { BadRequestException, GoneException } from "@force-dev/utils";
import { inject } from "inversify";
import moment from "moment";

import { config } from "../../../config";
import { generateOtp } from "../../common";
import { Injectable } from "../../core";
import { OtpRepository } from "./otp.repository";

const {
  auth: { otp },
} = config;

@Injectable()
export class OtpService {
  constructor(@inject(OtpRepository) private _otpRepository: OtpRepository) {}

  async create(userId: string) {
    const code = generateOtp();
    const findOtp = await this._otpRepository.findByUserId(userId);

    const expireAt = moment().add(otp.expireMinutes, "minutes").toDate();

    if (findOtp) {
      findOtp.code = code;
      findOtp.expireAt = expireAt;

      return await this._otpRepository.save(findOtp);
    } else {
      return this._otpRepository.create({
        userId,
        code,
        expireAt,
      });
    }
  }

  async check(userId: string, code: string) {
    const otp = await this._otpRepository.findByUserIdAndCode(userId, code);

    if (!otp) {
      throw new BadRequestException(
        "Неверный код. Пожалуйста, повторите попытку.",
      );
    }

    if (otp.expireAt < new Date()) {
      await this._otpRepository.delete(userId);
      throw new GoneException(
        "Срок действия кода истек. Пожалуйста, запросите новый код.",
      );
    }

    await this._otpRepository.delete(userId);

    return true;
  }
}
