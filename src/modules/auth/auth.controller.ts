import { inject } from "inversify";
import { Body, Controller, Post, Route, Tags } from "tsoa";

import { IApiResponseDto, Injectable } from "../../core";
import {
  ISignInRequestDto,
  ITokensDto,
  IUserLoginRequestDto,
  IUserResetPasswordRequestDto,
  IUserWithTokensDto,
  TSignUpRequestDto,
} from "./auth.dto";
import { AuthService } from "./auth.service";

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
  @Post("/sign-up")
  signUp(@Body() body: TSignUpRequestDto): Promise<IUserWithTokensDto> {
    return this._authService.signUp(body);
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
  @Post("/sign-in")
  signIn(@Body() body: ISignInRequestDto): Promise<IUserWithTokensDto> {
    return this._authService.signIn(body);
  }

  /**
   * Авторизация пользователя через OAuth code GitHub
   * @summary Вход в систему
   * @description Проверяет учетные данные и возвращает токены доступа.
   * @param body Данные для входа
   * @example body {
   *   "code": "30d2d5e372a3f828254d"
   * }
   * @response 200 - Успешный вход
   * @response 401 - Не найден пользователь
   */
  @Post("/authenticate")
  authenticate(@Body() body: { code: string }): Promise<IUserWithTokensDto> {
    return this._authService.authenticate(body);
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
  @Post("/request-reset-password")
  requestResetPassword(
    @Body() { login }: IUserLoginRequestDto,
  ): Promise<IApiResponseDto> {
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
  resetPassword(
    @Body() body: IUserResetPasswordRequestDto,
  ): Promise<IApiResponseDto> {
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
  refresh(@Body() body: { refreshToken: string }): Promise<ITokensDto> {
    return this._authService.updateTokens(body.refreshToken);
  }
}
