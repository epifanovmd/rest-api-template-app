import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@force-dev/utils";
import axios from "axios";
import bcrypt from "bcrypt";
import { inject } from "inversify";
import sha256 from "sha256";

import { config } from "../../../config";
import {
  ApiResponseDto,
  Injectable,
  logger,
  TokenService,
  verifyToken,
} from "../../core";
import { MailerService } from "../mailer";
import { ResetPasswordTokensService } from "../reset-password-tokens";
import { UserService } from "../user";
import { UserDto } from "../user/dto";
import {
  IAuthenticateRequestDto,
  ISignInRequestDto,
  ITokensDto,
  IUserWithTokensDto,
  TSignUpRequestDto,
} from "./auth.dto";

@Injectable()
export class AuthService {
  constructor(
    @inject(UserService) private _userService: UserService,
    @inject(MailerService) private _mailerService: MailerService,
    @inject(ResetPasswordTokensService)
    private _resetPasswordTokensService: ResetPasswordTokensService,
    @inject(TokenService) private _tokenService: TokenService,
  ) {}

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

    return this.signIn({ login, password });
  }

  async signIn(body: ISignInRequestDto): Promise<IUserWithTokensDto> {
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

      if (
        (await bcrypt.compare(password, user.passwordHash)) ||
        user.passwordHash === sha256(password)
      ) {
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

  async authenticate({
    code,
  }: IAuthenticateRequestDto): Promise<IUserWithTokensDto> {
    try {
      const accessToken = await this._exchangeCodeForToken(code);
      const githubUser = await this._getUserFromGitHub(accessToken);

      if (!githubUser.email) {
        throw new Error("GitHub account has no public email");
      }

      let user;

      try {
        user = await this._userService.getUserByAttr({
          email: githubUser.email,
        });
      } catch (error) {
        if (error instanceof NotFoundException) {
          const randomPassword = Math.random().toString(36).slice(-8);

          user = await this._userService.createUser({
            email: githubUser.email,
            passwordHash: await bcrypt.hash(randomPassword, 12),
          });
        } else {
          throw error;
        }
      }

      const fullUser = await this._userService.getUser(user.id);

      return {
        ...UserDto.fromEntity(fullUser),
        tokens: await this._tokenService.issue(fullUser),
      };
    } catch (error) {
      logger.error({ err: error }, "GitHub authentication error");
      throw new UnauthorizedException("Ошибка аутентификации через GitHub");
    }
  }

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

  async resetPassword(token: string, password: string) {
    const { userId } = await this._resetPasswordTokensService.check(token);

    await this._userService.changePassword(userId, password);

    return new ApiResponseDto({ message: "Пароль успешно сброшен." });
  }

  async updateTokens(token?: string): Promise<ITokensDto> {
    if (!token) {
      throw new UnauthorizedException("Токен отсутствует");
    }

    const { userId } = await verifyToken(token);
    const user = await this._userService.getUser(userId);

    return this._tokenService.issue(user);
  }

  private async _exchangeCodeForToken(code: string): Promise<string> {
    try {
      const response = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: config.auth.github.clientId,
          client_secret: config.auth.github.clientSecret,
          code: code,
        },
        { headers: { Accept: "application/json" } },
      );

      if (!response.data.access_token) {
        throw new Error("No access token received from GitHub");
      }

      return response.data.access_token;
    } catch (error) {
      logger.error({ err: error }, "GitHub token exchange error");
      throw new Error("Failed to exchange code for token");
    }
  }

  private async _getUserFromGitHub(accessToken: string): Promise<{
    githubId: number;
    login: string;
    email: string;
    name: string;
    avatar_url?: string;
  }> {
    try {
      const userResponse = await axios.get("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let email = userResponse.data.email;

      if (!email) {
        try {
          const emailsResponse = await axios.get(
            "https://api.github.com/user/emails",
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const primaryEmail = emailsResponse.data.find(
            (e: any) => e.primary,
          );

          email = primaryEmail ? primaryEmail.email : emailsResponse.data[0]?.email;
        } catch (emailError) {
          logger.error({ err: emailError }, "Failed to fetch GitHub emails");
        }
      }

      return {
        githubId: userResponse.data.id,
        login: userResponse.data.login,
        email: email || "",
        name: userResponse.data.name,
        avatar_url: userResponse.data.avatar_url,
      };
    } catch (error) {
      logger.error({ err: error }, "GitHub user fetch error");
      throw new Error("Failed to fetch user data from GitHub");
    }
  }
}
