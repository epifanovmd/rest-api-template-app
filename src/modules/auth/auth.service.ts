import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@force-dev/utils";
import axios from "axios";
import { inject } from "inversify";
import sha256 from "sha256";

import {
  ApiResponse,
  createTokenAsync,
  Injectable,
  verifyAuthToken,
} from "../../core";
import { MailerService } from "../mailer";
import { ResetPasswordTokensService } from "../reset-password-tokens";
import { UserService } from "../user";
import {
  IAuthenticateRequest,
  ISignInRequest,
  ITokensDto,
  IUserWithTokensDto,
  TSignUpRequest,
} from "./auth.types";

const GITHUB_CLIENT_ID = "Ov23lizh9Zepze4yliRV";
const GITHUB_CLIENT_SECRET = "d1cbef76205d2d527ca8c6646c03eca70b4c6f8a";

@Injectable()
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

    // Проверяем существование пользователя
    try {
      const existingUser = await this._userService.getUserByAttr(
        email ? { email } : { phone },
      );

      if (existingUser) {
        throw new BadRequestException(`Клиент - ${login}, уже зарегистрирован`);
      }
    } catch (error) {
      // Если пользователь не найден (NotFoundException), продолжаем регистрацию
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }

    // Создаем пользователя
    await this._userService.createUser({
      ...rest,
      phone,
      email,
      passwordHash: sha256(password),
    });

    // Выполняем вход
    return this.signIn({
      login,
      password,
    });
  }

  async signIn(body: ISignInRequest): Promise<IUserWithTokensDto> {
    const { login, password } = body;

    try {
      // Пытаемся найти пользователя по email или телефону
      let user;

      try {
        // Пробуем сначала как email
        if (login.includes("@")) {
          user = await this._userService.getUserByAttr({ email: login });
        } else {
          // Иначе как телефон
          user = await this._userService.getUserByAttr({ phone: login });
        }
      } catch (error) {
        // Если не нашли одним способом, пробуем другим
        if (error instanceof NotFoundException) {
          try {
            if (login.includes("@")) {
              user = await this._userService.getUserByAttr({ phone: login });
            } else {
              user = await this._userService.getUserByAttr({ email: login });
            }
          } catch (innerError) {
            // Если и второй способ не сработал, бросаем исключение
            throw new UnauthorizedException("Не верный логин или пароль");
          }
        } else {
          throw error;
        }
      }

      // Проверяем пароль
      if (user.passwordHash === sha256(password)) {
        // Получаем полную информацию о пользователе с ролью
        const fullUser = await this._userService.getUser(user.id);

        // Формируем ответ
        const data = {
          id: fullUser.id,
          email: fullUser.email,
          emailVerified: fullUser.emailVerified,
          phone: fullUser.phone,
          challenge: fullUser.challenge,
          createdAt: fullUser.createdAt,
          updatedAt: fullUser.updatedAt,
          role: fullUser.role,
        };

        return {
          ...data,
          tokens: await this.getTokens(data.id),
        };
      }
    } catch (error) {
      // Логируем только реальные ошибки, не ошибки аутентификации
      if (!(error instanceof UnauthorizedException)) {
        console.error("Sign in error:", error);
      }
    }

    throw new UnauthorizedException("Не верный логин или пароль");
  }

  async authenticate({
    code,
  }: IAuthenticateRequest): Promise<IUserWithTokensDto> {
    try {
      // Обмен code на access token
      const accessToken = await this._exchangeCodeForToken(code);

      // Получение данных пользователя из GitHub
      const githubUser = await this._getUserFromGitHub(accessToken);

      if (!githubUser.email) {
        throw new Error("GitHub account has no public email");
      }

      // Пытаемся найти существующего пользователя
      let user;

      try {
        user = await this._userService.getUserByAttr({
          email: githubUser.email,
        });
      } catch (error) {
        // Если пользователь не найден, создаем нового
        if (error instanceof NotFoundException) {
          // Генерируем случайный пароль для GitHub пользователя
          const randomPassword = Math.random().toString(36).slice(-8);

          user = await this._userService.createUser({
            email: githubUser.email,
            passwordHash: sha256(randomPassword),
            // emailVerified: true, // GitHub email уже верифицирован
          });
        } else {
          throw error;
        }
      }

      // Получаем полную информацию о пользователе
      const fullUser = await this._userService.getUser(user.id);

      const data = {
        id: fullUser.id,
        email: fullUser.email,
        emailVerified: fullUser.emailVerified,
        phone: fullUser.phone,
        challenge: fullUser.challenge,
        createdAt: fullUser.createdAt,
        updatedAt: fullUser.updatedAt,
        role: fullUser.role,
      };

      return {
        ...data,
        tokens: await this.getTokens(data.id),
      };
    } catch (error) {
      console.error("GitHub authentication error:", error);
      throw new UnauthorizedException("Ошибка аутентификации через GitHub");
    }
  }

  async requestResetPassword(login: string) {
    try {
      // Пытаемся найти пользователя
      let user;

      try {
        if (login.includes("@")) {
          user = await this._userService.getUserByAttr({ email: login });
        } else {
          user = await this._userService.getUserByAttr({ phone: login });
        }
      } catch (error) {
        // Если пользователь не найден, не сообщаем об этом для безопасности
        if (error instanceof NotFoundException) {
          return new ApiResponse({
            message:
              "Если пользователь с таким email/телефоном существует, ссылка для сброса пароля будет отправлена.",
          });
        }
        throw error;
      }

      // Проверяем наличие email
      if (!user.email) {
        throw new NotFoundException("У пользователя отсутствует email.");
      }

      // Создаем токен сброса пароля
      const resetToken = await this._resetPasswordTokensService.create(user.id);

      // Отправляем email
      await this._mailerService.sendResetPasswordMail(
        user.email,
        resetToken.token,
      );

      return new ApiResponse({
        message:
          "Ссылка для сброса пароля отправлена на вашу почту. Проверьте входящие или папку Спам.",
      });
    } catch (error) {
      // Для безопасности скрываем реальную причину ошибки
      if (error instanceof NotFoundException) {
        return new ApiResponse({
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

    return new ApiResponse({ message: "Пароль успешно сброшен." });
  }

  async updateTokens(token?: string) {
    if (!token) {
      throw new UnauthorizedException("Токен отсутствует");
    }

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

  // 1. Получение токена через code
  private async _exchangeCodeForToken(code: string): Promise<string> {
    try {
      const response = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code: code,
        },
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.data.access_token) {
        throw new Error("No access token received from GitHub");
      }

      return response.data.access_token;
    } catch (error) {
      console.error("GitHub token exchange error:", error);
      throw new Error("Failed to exchange code for token");
    }
  }

  // 2. Получение данных пользователя из GitHub
  private async _getUserFromGitHub(accessToken: string): Promise<{
    githubId: number;
    login: string;
    email: string;
    name: string;
    avatar_url?: string;
  }> {
    try {
      const userResponse = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Если email не публичный, запрашиваем список emails
      let email = userResponse.data.email;

      if (!email) {
        try {
          const emailsResponse = await axios.get(
            "https://api.github.com/user/emails",
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );

          const primaryEmail = emailsResponse.data.find(
            (emailObj: any) => emailObj.primary,
          );

          email = primaryEmail
            ? primaryEmail.email
            : emailsResponse.data[0]?.email;
        } catch (emailError) {
          console.error("Failed to fetch GitHub emails:", emailError);
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
      console.error("GitHub user fetch error:", error);
      throw new Error("Failed to fetch user data from GitHub");
    }
  }
}
