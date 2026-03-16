import { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { inject } from "inversify";
import { Body, Controller, Post, Request, Route, Security, Tags } from "tsoa";

import { getContextUser, Injectable } from "../../core";
import { KoaRequest } from "../../types/koa";
import {
  IGenerateAuthenticationOptionsRequestDto,
  IVerifyAuthenticationRequestDto,
  IVerifyAuthenticationResponseDto,
  IVerifyRegistrationRequestDto,
  IVerifyRegistrationResponseDto,
} from "./passkeys.dto";
import { PasskeysService } from "./passkeys.service";

@Injectable()
@Tags("Passkeys")
@Route("api/passkeys")
export class PasskeysController extends Controller {
  constructor(
    @inject(PasskeysService) private _passkeysService: PasskeysService,
  ) {
    super();
  }

  /**
   * Генерирует параметры для регистрации нового passkey.
   * Требует авторизации — passkey привязывается к текущему пользователю.
   *
   * @summary Параметры регистрации passkey
   */
  @Security("jwt")
  @Post("/generate-registration-options")
  generateRegistrationOptions(
    @Request() req: KoaRequest,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const { userId } = getContextUser(req);

    return this._passkeysService.generateRegistrationOptions(userId);
  }

  /**
   * Верифицирует ответ устройства и сохраняет passkey для текущего пользователя.
   *
   * @summary Верификация регистрации passkey
   */
  @Security("jwt")
  @Post("/verify-registration")
  verifyRegistration(
    @Request() req: KoaRequest,
    @Body() { data }: IVerifyRegistrationRequestDto,
  ): Promise<IVerifyRegistrationResponseDto> {
    const { userId } = getContextUser(req);

    return this._passkeysService.verifyRegistration(userId, data);
  }

  /**
   * Генерирует параметры для аутентификации по passkey.
   * Принимает login (email или телефон) пользователя.
   *
   * @summary Параметры аутентификации passkey
   */
  @Post("/generate-authentication-options")
  generateAuthenticationOptions(
    @Body() { login }: IGenerateAuthenticationOptionsRequestDto,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return this._passkeysService.generateAuthenticationOptions(login);
  }

  /**
   * Верифицирует ответ устройства и возвращает токены при успехе.
   *
   * @summary Аутентификация по passkey
   */
  @Post("/verify-authentication")
  verifyAuthentication(
    @Body() { data }: IVerifyAuthenticationRequestDto,
  ): Promise<IVerifyAuthenticationResponseDto> {
    return this._passkeysService.verifyAuthentication(data);
  }
}
