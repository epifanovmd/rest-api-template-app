import { inject } from "inversify";
import {
  Body,
  Controller,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import {
  ApiResponseDto,
  getContextUser,
  Injectable,
  ITokensDto,
  ThrottleGuard,
  UseGuards,
  ValidateBody,
} from "../../core";
import { KoaRequest } from "../../types/koa";
import {
  IDeviceInfo,
  IDisable2FARequestDto,
  IEnable2FARequestDto,
  ISignInRequestDto,
  ISignInResponseDto,
  IUserLoginRequestDto,
  IUserResetPasswordRequestDto,
  IUserWithTokensDto,
  IVerify2FARequestDto,
  TSignUpRequestDto,
} from "./auth.dto";
import { AuthService } from "./auth.service";
import {
  Disable2FASchema,
  Enable2FASchema,
  RefreshSchema,
  RequestResetPasswordSchema,
  ResetPasswordSchema,
  SignInSchema,
  SignUpSchema,
  Verify2FASchema,
} from "./validation";

@Injectable()
@Tags("Authorization")
@Route("api/auth")
export class AuthController extends Controller {
  constructor(@inject(AuthService) private _authService: AuthService) {
    super();
  }

  /**
   * Регистрация нового пользователя
   * @summary Регистрация
   * @description Создает новую учетную запись и возвращает токены доступа.
   * @param body Данные для регистрации
   * @example body {
   *   "email": "user@example.com",
   *   "password": "password123",
   *   "firstName": "John",
   *   "lastName": "Doe"
   * }
   * @response 201 - Успешная регистрация
   * @response 400 - Некорректные данные
   */
  @UseGuards(ThrottleGuard(5, 60_000))
  @Post("/sign-up")
  @ValidateBody(SignUpSchema)
  signUp(
    @Request() req: KoaRequest,
    @Body() body: TSignUpRequestDto,
  ): Promise<IUserWithTokensDto> {
    return this._authService.signUp(body, this._extractDeviceInfo(req));
  }

  /**
   * Авторизация пользователя
   * @summary Вход в систему
   * @description Проверяет учетные данные и возвращает токены доступа.
   * @param body Данные для входа
   * @example body {
   *   "login": "epifanovmd@gmail.com",
   *   "password": "Epifan123"
   * }
   * @response 200 - Успешный вход
   * @response 401 - Неверные учетные данные
   */
  @UseGuards(ThrottleGuard(10, 60_000))
  @Post("/sign-in")
  @ValidateBody(SignInSchema)
  signIn(
    @Request() req: KoaRequest,
    @Body() body: ISignInRequestDto,
  ): Promise<ISignInResponseDto> {
    return this._authService.signIn(body, this._extractDeviceInfo(req));
  }

  /**
   * Запрос на сброс пароля
   * @summary Запрос сброса пароля
   * @description Отправляет письмо со ссылкой для восстановления пароля.
   * @param body Логин (email или телефон)
   * @example body {
   *   "login": "user@example.com"
   * }
   * @response 200 - Запрос принят
   * @response 404 - Пользователь не найден
   */
  @UseGuards(ThrottleGuard(3, 300_000))
  @Post("/request-reset-password")
  @ValidateBody(RequestResetPasswordSchema)
  requestResetPassword(
    @Body() { login }: IUserLoginRequestDto,
  ): Promise<ApiResponseDto> {
    return this._authService.requestResetPassword(login);
  }

  /**
   * Сброс пароля
   * @summary Смена пароля
   * @description Позволяет установить новый пароль, используя токен сброса.
   * @param body Токен и новый пароль
   * @example body {
   *   "token": "reset-token-123",
   *   "password": "newSecurePassword"
   * }
   * @response 200 - Пароль успешно изменен
   * @response 400 - Некорректный или просроченный токен
   */
  @Post("/reset-password")
  @ValidateBody(ResetPasswordSchema)
  resetPassword(
    @Body() body: IUserResetPasswordRequestDto,
  ): Promise<ApiResponseDto> {
    return this._authService.resetPassword(body.token, body.password);
  }

  /**
   * Обновление токенов доступа
   * @summary Обновление токенов
   * @description Выдает новый access и refresh токены на основе старого refresh токена.
   * @param body Тело запроса с refresh токеном
   * @example body {
   *   "refreshToken": "old-refresh-token"
   * }
   * @response 200 - Успешное обновление токенов
   * @response 401 - Неверный или просроченный refresh-токен
   */
  @Post("/refresh")
  @ValidateBody(RefreshSchema)
  refresh(@Body() body: { refreshToken: string }): Promise<ITokensDto> {
    return this._authService.updateTokens(body.refreshToken);
  }

  /**
   * Включить двухфакторную аутентификацию.
   * @summary Включение 2FA
   */
  @Security("jwt")
  @Post("/enable-2fa")
  @ValidateBody(Enable2FASchema)
  enable2FA(
    @Request() req: KoaRequest,
    @Body() body: IEnable2FARequestDto,
  ): Promise<ApiResponseDto> {
    const user = getContextUser(req);

    return this._authService.enable2FA(user.userId, body.password, body.hint);
  }

  /**
   * Отключить двухфакторную аутентификацию.
   * @summary Отключение 2FA
   */
  @Security("jwt")
  @Post("/disable-2fa")
  @ValidateBody(Disable2FASchema)
  disable2FA(
    @Request() req: KoaRequest,
    @Body() body: IDisable2FARequestDto,
  ): Promise<ApiResponseDto> {
    const user = getContextUser(req);

    return this._authService.disable2FA(user.userId, body.password);
  }

  /**
   * Верифицировать 2FA и получить токены.
   * @summary Верификация 2FA
   */
  @Post("/verify-2fa")
  @ValidateBody(Verify2FASchema)
  verify2FA(
    @Request() req: KoaRequest,
    @Body() body: IVerify2FARequestDto,
  ): Promise<IUserWithTokensDto> {
    return this._authService.verify2FA(
      body.twoFactorToken,
      body.password,
      this._extractDeviceInfo(req),
    );
  }

  private _extractDeviceInfo(req: KoaRequest): IDeviceInfo {
    return {
      ip: req.ctx?.request?.ip,
      userAgent: req.ctx?.request?.headers?.["user-agent"] as string | undefined,
      deviceName: req.ctx?.request?.headers?.["x-device-name"] as
        | string
        | undefined,
      deviceType: req.ctx?.request?.headers?.["x-device-type"] as
        | string
        | undefined,
    };
  }
}
