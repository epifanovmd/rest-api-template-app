import { BadRequestException } from "@force-dev/utils";
import { injectable } from "inversify";

import { config } from "../../../config";
import { createToken, verifyToken } from "../../common/helpers/jwt";
import { ResetPasswordTokens } from "./reset-password-tokens.model";

const { RESET_PASS_TOKEN_EXPIRE_MINUTES } = config;

@injectable()
export class ResetPasswordTokensService {
  create = async (profileId: string) => {
    const token = await createToken(profileId, {
      expiresIn: `${RESET_PASS_TOKEN_EXPIRE_MINUTES}m`,
    });
    const findResetPasswordTokens = await ResetPasswordTokens.findOne({
      where: { profileId },
    });

    if (findResetPasswordTokens) {
      findResetPasswordTokens.token = token;

      return await findResetPasswordTokens.save();
    } else {
      return ResetPasswordTokens.create({
        profileId,
        token,
      });
    }
  };

  check = async (token: string) => {
    const { profileId } = await verifyToken(token);

    const resetPasswordToken = await ResetPasswordTokens.findOne({
      where: {
        profileId,
        token,
      },
    });

    if (!resetPasswordToken) {
      throw new BadRequestException(
        "Неверный токен. Пожалуйста, повторите попытку.",
      );
    }

    await resetPasswordToken.destroy();

    return { profileId, token };
  };
}
