import { BadRequestException, GoneException } from "@force-dev/utils";
import { injectable } from "inversify";
import moment from "moment";

import { config } from "../../../config";
import { generateOtp } from "../../common";
import { Otp } from "./otp.model";

const { OTP_EXPIRE_MINUTES } = config;

@injectable()
export class OtpService {
  create = async (profileId: string) => {
    const code = generateOtp();
    const findOtp = await Otp.findOne({ where: { profileId } });

    if (findOtp) {
      findOtp.code = code;
      findOtp.expireAt = moment().add(OTP_EXPIRE_MINUTES, "minutes").toDate();

      return await findOtp.save();
    } else {
      return Otp.create({
        profileId,
        code,
        expireAt: moment().add(OTP_EXPIRE_MINUTES, "minutes").toDate(),
      });
    }
  };

  check = async (profileId: string, code: string) => {
    const otp = await Otp.findOne({ where: { profileId, code } });

    if (!otp) {
      throw new BadRequestException(
        "Неверный код. Пожалуйста, повторите попытку.",
      );
    }

    if (otp.expireAt < new Date()) {
      await otp.destroy();
      throw new GoneException(
        "Срок действия кода истек. Пожалуйста, запросите новый код.",
      );
    }

    await otp.destroy();

    return true;
  };
}
