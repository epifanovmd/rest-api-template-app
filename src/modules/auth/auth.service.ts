import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@force-dev/utils";
import bcrypt from "bcrypt";
import { inject } from "inversify";
import jwt from "jsonwebtoken";

import { config } from "../../config";
import {
  ApiResponseDto,
  Injectable,
  ITokensDto,
  logger,
  TokenService,
  verifyToken,
} from "../../core";
import { MailerService } from "../mailer";
import { ResetPasswordTokensService } from "../reset-password-tokens";
import { UserService } from "../user";
import { UserDto } from "../user/dto";
import { UserRepository } from "../user/user.repository";
import {
  ISignInRequestDto,
  ISignInResponseDto,
  IUserWithTokensDto,
  TSignUpRequestDto,
} from "./auth.dto";

/** Сервис аутентификации: регистрация, вход, сброс пароля и обновление токенов. */
@Injectable()
export class AuthService {
  constructor(
    @inject(UserService) private _userService: UserService,
    @inject(MailerService) private _mailerService: MailerService,
    @inject(ResetPasswordTokensService)
    private _resetPasswordTokensService: ResetPasswordTokensService,
    @inject(TokenService) private _tokenService: TokenService,
    @inject(UserRepository) private _userRepository: UserRepository,
  ) {}

  /** Зарегистрировать нового пользователя и сразу выдать токены. */
  async signUp({
    email,
    phone,
    password,
    ...rest
  }: TSignUpRequestDto): Promise<IUserWithTokensDto> {
    const login = email || phone;

    if (!login) {
      throw new BadRequestException(
        "Необходимо указать либо email, либо телефон, а также пароль.",
      );
    }

    try {
      const existingUser = await this._userService.getUserByAttr(
        email ? { email } : { phone },
      );

      if (existingUser) {
        throw new BadRequestException(`Клиент - ${login}, уже зарегистрирован`);
      }
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }

    await this._userService.createUser({
      ...rest,
      phone,
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });

    return this.signIn({ login, password }) as Promise<IUserWithTokensDto>;
  }

  /** Аутентифицировать пользователя по логину (email/телефон) и паролю. */
  async signIn(body: ISignInRequestDto): Promise<ISignInResponseDto> {
    const { login, password } = body;

    try {
      let user;

      try {
        if (login.includes("@")) {
          user = await this._userService.getUserByAttr({ email: login });
        } else {
          user = await this._userService.getUserByAttr({ phone: login });
        }
      } catch (error) {
        if (error instanceof NotFoundException) {
          try {
            if (login.includes("@")) {
              user = await this._userService.getUserByAttr({ phone: login });
            } else {
              user = await this._userService.getUserByAttr({ email: login });
            }
          } catch {
            throw new UnauthorizedException("Не верный логин или пароль");
          }
        } else {
          throw error;
        }
      }

      if (await bcrypt.compare(password, user.passwordHash)) {
        // Check if 2FA is enabled
        if (user.twoFactorHash) {
          const twoFactorToken = jwt.sign(
            { userId: user.id, type: "2fa" },
            config.auth.jwt.secretKey,
            { expiresIn: "5m" },
          );

          return {
            require2FA: true,
            twoFactorToken,
            twoFactorHint: user.twoFactorHint ?? undefined,
          };
        }

        const fullUser = await this._userService.getUser(user.id);

        return {
          ...UserDto.fromEntity(fullUser),
          tokens: await this._tokenService.issue(fullUser),
        };
      }
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        logger.error({ err: error }, "Sign in error");
      }
    }

    throw new UnauthorizedException("Не верный логин или пароль");
  }

  /** Инициировать сброс пароля — отправить письмо со ссылкой на сброс. */
  async requestResetPassword(login: string) {
    try {
      let user;

      try {
        if (login.includes("@")) {
          user = await this._userService.getUserByAttr({ email: login });
        } else {
          user = await this._userService.getUserByAttr({ phone: login });
        }
      } catch (error) {
        if (error instanceof NotFoundException) {
          return new ApiResponseDto({
            message:
              "Если пользователь с таким email/телефоном существует, ссылка для сброса пароля будет отправлена.",
          });
        }
        throw error;
      }

      if (!user.email) {
        throw new NotFoundException("У пользователя отсутствует email.");
      }

      const resetToken = await this._resetPasswordTokensService.create(user.id);

      await this._mailerService.sendResetPasswordMail(
        user.email,
        resetToken.token,
      );

      return new ApiResponseDto({
        message:
          "Ссылка для сброса пароля отправлена на вашу почту. Проверьте входящие или папку Спам.",
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        return new ApiResponseDto({
          message:
            "Если пользователь с таким email/телефоном существует, ссылка для сброса пароля будет отправлена.",
        });
      }
      throw error;
    }
  }

  /** Установить новый пароль пользователю по действующему токену сброса. */
  async resetPassword(token: string, password: string) {
    const { userId } = await this._resetPasswordTokensService.check(token);

    await this._userService.changePassword(userId, password);

    return new ApiResponseDto({ message: "Пароль успешно сброшен." });
  }

  /** Обновить access + refresh токены по переданному refresh-токену. */
  async updateTokens(token?: string): Promise<ITokensDto> {
    if (!token) {
      throw new UnauthorizedException("Токен отсутствует");
    }

    const { userId } = await verifyToken(token);
    const user = await this._userService.getUser(userId);

    return this._tokenService.issue(user);
  }

  /** Включить 2FA для пользователя. */
  async enable2FA(userId: string, password: string, hint?: string) {
    const user = await this._userService.getUser(userId);

    if (user.twoFactorHash) {
      throw new BadRequestException("2FA уже включена");
    }

    const twoFactorHash = await bcrypt.hash(password, 12);

    await this._userRepository.update(userId, {
      twoFactorHash,
      twoFactorHint: hint ?? null,
    });

    return new ApiResponseDto({ message: "2FA успешно включена." });
  }

  /** Отключить 2FA для пользователя. */
  async disable2FA(userId: string, password: string) {
    const user = await this._userService.getUser(userId);

    if (!user.twoFactorHash) {
      throw new BadRequestException("2FA не включена");
    }

    if (!(await bcrypt.compare(password, user.twoFactorHash))) {
      throw new UnauthorizedException("Неверный пароль 2FA");
    }

    await this._userRepository.update(userId, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      twoFactorHash: null as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      twoFactorHint: null as any,
    });

    return new ApiResponseDto({ message: "2FA успешно отключена." });
  }

  /** Верифицировать 2FA и выдать токены. */
  async verify2FA(
    twoFactorToken: string,
    password: string,
  ): Promise<IUserWithTokensDto> {
    const decoded = await verifyToken(twoFactorToken);

    if ((decoded as Record<string, unknown>).type !== "2fa") {
      throw new UnauthorizedException("Неверный токен 2FA");
    }

    const user = await this._userService.getUser(decoded.userId);

    if (!user.twoFactorHash) {
      throw new BadRequestException("2FA не включена для этого пользователя");
    }

    if (!(await bcrypt.compare(password, user.twoFactorHash))) {
      throw new UnauthorizedException("Неверный пароль 2FA");
    }

    return {
      ...UserDto.fromEntity(user),
      tokens: await this._tokenService.issue(user),
    };
  }
}
