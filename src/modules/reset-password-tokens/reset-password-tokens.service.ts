import { BadRequestException } from "@force-dev/utils";
import { injectable } from "inversify";

import { config } from "../../../config";
import { createToken, verifyToken } from "../../common/helpers/jwt";
import { Injectable } from "../../decorators/injectable.decorator";
import { ResetPasswordTokens } from "./reset-password-tokens.model";

const { RESET_PASS_TOKEN_EXPIRE_MINUTES } = config;

@Injectable()
export class ResetPasswordTokensService {
  create = async (userId: string) => {
    const token = await createToken(userId, {
      expiresIn: `${RESET_PASS_TOKEN_EXPIRE_MINUTES}m`,
    });
    const findResetPasswordTokens = await ResetPasswordTokens.findOne({
      where: { userId },
    });

    if (findResetPasswordTokens) {
      findResetPasswordTokens.token = token;

      return await findResetPasswordTokens.save();
    } else {
      return ResetPasswordTokens.create({
        userId,
        token,
      });
    }
  };

  check = async (token: string) => {
    const { userId } = await verifyToken(token);

    const resetPasswordToken = await ResetPasswordTokens.findOne({
      where: {
        userId,
        token,
      },
    });

    if (!resetPasswordToken) {
      throw new BadRequestException(
        "Неверный токен. Пожалуйста, повторите попытку.",
      );
    }

    await resetPasswordToken.destroy();

    return { userId, token };
  };
}
