import { BadRequestException } from "@force-dev/utils";
import { inject, injectable } from "inversify";

import { config } from "../../../config";
import { createToken, verifyToken } from "../../common/helpers/jwt";
import { Injectable } from "../../core";
import { ResetPasswordTokensRepository } from "./reset-password-tokens.repository";

const {
  auth: { resetPassword },
} = config;

@Injectable()
export class ResetPasswordTokensService {
  constructor(
    @inject(ResetPasswordTokensRepository)
    private _resetPasswordTokensRepository: ResetPasswordTokensRepository,
  ) {}

  async create(userId: string) {
    const token = await createToken(userId, {
      expiresIn: `${resetPassword.expireMinutes}m`,
    });

    const findResetPasswordTokens =
      await this._resetPasswordTokensRepository.findByUserId(userId);

    if (findResetPasswordTokens) {
      findResetPasswordTokens.token = token;

      return await this._resetPasswordTokensRepository.save(
        findResetPasswordTokens,
      );
    } else {
      return this._resetPasswordTokensRepository.create({
        userId,
        token,
      });
    }
  }

  async check(token: string) {
    const { userId } = await verifyToken(token);

    const resetPasswordToken =
      await this._resetPasswordTokensRepository.findByToken(token);

    if (!resetPasswordToken) {
      throw new BadRequestException(
        "Неверный токен. Пожалуйста, повторите попытку.",
      );
    }

    await this._resetPasswordTokensRepository.delete(userId);

    return { userId, token };
  }
}
