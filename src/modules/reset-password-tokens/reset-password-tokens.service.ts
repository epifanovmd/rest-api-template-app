import { BadRequestException } from "@force-dev/utils";
import { inject } from "inversify";

import { config } from "../../config";
import { createToken, Injectable, verifyToken } from "../../core";
import { ResetPasswordTokensRepository } from "./reset-password-tokens.repository";

const {
  auth: { resetPassword },
} = config;

/** Сервис для создания и проверки JWT-токенов сброса пароля. */
@Injectable()
export class ResetPasswordTokensService {
  constructor(
    @inject(ResetPasswordTokensRepository)
    private _resetPasswordTokensRepository: ResetPasswordTokensRepository,
  ) {}

  /** Создать или обновить JWT-токен сброса пароля для пользователя. */
  async create(userId: string) {
    const token = await createToken(
      { userId, sessionId: "", roles: [], permissions: [], emailVerified: false },
      { expiresIn: `${resetPassword.expireMinutes}m` },
    );

    const findResetPasswordTokens =
      await this._resetPasswordTokensRepository.findByUserId(userId);

    if (findResetPasswordTokens) {
      findResetPasswordTokens.token = token;

      return await this._resetPasswordTokensRepository.save(
        findResetPasswordTokens,
      );
    } else {
      return this._resetPasswordTokensRepository.createAndSave({
        userId,
        token,
      });
    }
  }

  /** Проверить токен сброса пароля и удалить его после успешной валидации. */
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
