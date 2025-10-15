import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@force-dev/utils";
import { inject, injectable } from "inversify";
import { Op } from "sequelize";
import sha256 from "sha256";

import {
  createTokenAsync,
  validateEmail,
  validatePhone,
  verifyAuthToken,
} from "../../common";
import { ApiResponse } from "../../dto/ApiResponse";
import { MailerService } from "../mailer";
import { ResetPasswordTokensService } from "../reset-password-tokens";
import { UserService } from "../user";
import {
  ISignInRequest,
  ITokensDto,
  IUserWithTokensDto,
  TSignUpRequest,
} from "./auth.types";

@injectable()
export class AuthService {
  constructor(
    @inject(UserService) private _userService: UserService,
    @inject(MailerService) private _mailerService: MailerService,
    @inject(ResetPasswordTokensService)
    private _resetPasswordTokensService: ResetPasswordTokensService,
  ) {}

  async signUp({
    email,
    phone,
    password,
    ...rest
  }: TSignUpRequest): Promise<IUserWithTokensDto> {
    const login = email || phone;

    if (!login) {
      throw new BadRequestException(
        "Необходимо указать либо email, либо телефон, а также пароль.",
      );
    }

    if (email) {
      validateEmail(email);
    }
    if (phone) {
      validatePhone(phone);
    }

    const client = await this._userService
      .getUserByAttr({
        [Op.or]: [{ email: email ?? "" }, { phone: phone ?? "" }],
      })
      .catch(() => null);

    if (client) {
      throw new BadRequestException(`Клиент - ${login}, уже зарегистрирован`);
    } else {
      return this._userService
        .createUser({
          ...rest,
          phone,
          email,
          passwordHash: sha256(password),
        })
        .then(() =>
          this.signIn({
            login,
            password,
          }),
        );
    }
  }

  async signIn(body: ISignInRequest): Promise<IUserWithTokensDto> {
    const { login, password } = body;

    try {
      const { id, passwordHash } = await this._userService.getUserByAttr({
        [Op.or]: [{ email: login ?? "" }, { phone: login ?? "" }],
      });

      if (passwordHash === sha256(password)) {
        const user = await this._userService.getUser(id);

        const role = user.role;

        const data = {
          ...user.toJSON(),
          role,
        };

        return {
          ...data,
          tokens: await this.getTokens(data.id),
        };
      }
    } catch {
      /* empty */
    }

    throw new UnauthorizedException("Не верный логин или пароль");
  }

  async requestResetPassword(login: string) {
    const { id, email } = await this._userService.getUserByAttr({
      [Op.or]: [{ email: login ?? "" }, { phone: login ?? "" }],
    });

    if (!email) {
      throw new NotFoundException("У пользователя отсутсвует email.");
    }

    const { token } = await this._resetPasswordTokensService.create(id);

    await this._mailerService.sendResetPasswordMail(email, token);

    return new ApiResponse({
      message:
        "Ссылка для сброса пароля отправлена на вашу почту. Проверьте входящие или папку Спам.",
    });
  }

  async resetPassword(token: string, password: string) {
    const { userId } = await this._resetPasswordTokensService.check(token);

    await this._userService.changePassword(userId, password);

    return new ApiResponse({ message: "Пароль успешно сброшен." });
  }

  async updateTokens(token?: string) {
    const user = await verifyAuthToken(token);

    return this.getTokens(user.id);
  }

  async getTokens(userId: string): Promise<ITokensDto> {
    const [accessToken, refreshToken] = await createTokenAsync([
      {
        userId,
        opts: { expiresIn: "15m" },
      },
      {
        userId,
        opts: { expiresIn: "7d" },
      },
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
