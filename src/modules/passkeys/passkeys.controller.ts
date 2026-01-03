import { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { inject } from "inversify";
import { Body, Controller, Post, Route, Tags } from "tsoa";

import { Injectable } from "../../core";
import {
  IVerifyAuthenticationRequest,
  IVerifyAuthenticationResponse,
  IVerifyRegistrationRequest,
} from "./passkeys.dto";
import { PasskeysService } from "./passkeys.service";

@Injectable()
@Tags("Passkeys")
@Route("api/passkeys")
export class PasskeysController extends Controller {
  constructor(@inject(PasskeysService) private _authService: PasskeysService) {
    super();
  }

  /**
   * Генерирует параметры для регистрации нового устройства с использованием Passkeys.
   * Этот эндпоинт используется для создания параметров, которые будут отправлены клиенту для
   * регистрации нового устройства. Клиент должен будет выполнить регистрацию, используя данные
   * сгенерированные этим запросом.
   *
   * @summary Генерация параметров регистрации
   * @param body Объект с полем userId, который представляет ID пользователя в системе.
   * @returns Параметры для регистрации устройства, соответствующие спецификации WebAuthn.
   */
  @Post("/generate-registration-options")
  async generateRegistrationOptions(
    @Body() { userId }: { userId: string },
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return await this._authService.generateRegistrationOptions(userId);
  }

  /**
   * Проверяет данные регистрации для нового устройства.
   * Этот эндпоинт используется для подтверждения данных, которые были отправлены клиентом
   * после попытки регистрации нового устройства. Он валидирует предоставленные данные
   * и завершает процесс регистрации.
   *
   * @summary Проверка данных регистрации
   * @param body Объект с полями userId (ID пользователя) и data (данные регистрации, отправленные с клиентской стороны).
   * @returns Объект, который сообщает, был ли процесс регистрации успешным.
   */
  @Post("/verify-registration")
  async verifyRegistration(
    @Body() { userId, data }: IVerifyRegistrationRequest,
  ): Promise<{
    verified: boolean;
  }> {
    return await this._authService.verifyRegistration(userId, data);
  }

  /**
   * Генерирует параметры для аутентификации пользователя с использованием Passkeys.
   * Этот эндпоинт создает параметры аутентификации, которые будут отправлены клиенту для
   * выполнения аутентификации с помощью Passkeys. Эти параметры используются клиентом для
   * вызова аутентификации на его устройстве.
   *
   * @summary Генерация параметров аутентификации
   * @param body Объект с полем userId, который представляет ID пользователя в системе.
   * @returns Параметры для аутентификации устройства, соответствующие спецификации WebAuthn.
   */
  @Post("/generate-authentication-options")
  async generateAuthenticationOptions(
    @Body() { userId }: { userId: string },
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return await this._authService.generateAuthenticationOptions(userId);
  }

  /**
   * Проверяет данные аутентификации для пользователя.
   * Этот эндпоинт проверяет данные аутентификации, которые были отправлены с клиентской стороны,
   * и завершается успешной или неудачной аутентификацией в зависимости от результатов проверки.
   *
   * @summary Проверка данных аутентификации
   * @param body Объект с полями userId (ID пользователя) и data (данные аутентификации, отправленные с клиентской стороны).
   * @returns Ответ, который включает в себя результат аутентификации и другие данные.
   */
  @Post("/verify-authentication")
  async verifyAuthentication(
    @Body() { userId, data }: IVerifyAuthenticationRequest,
  ): Promise<IVerifyAuthenticationResponse> {
    return await this._authService.verifyAuthentication(userId, data);
  }
}
