import { inject } from "inversify";
import { Body, Controller, Post, Route, Tags } from "tsoa";

import { Injectable } from "../../core";
import {
  IGenerateNonceRequest,
  IGenerateNonceResponse,
  IRegisterBiometricRequest,
  IRegisterBiometricResponse,
  IVerifyBiometricSignatureRequest,
  IVerifyBiometricSignatureResponse,
} from "./biometric.dto";
import { BiometricService } from "./biometric.service";

@Injectable()
@Tags("Biometric")
@Route("api/biometric")
export class BiometricController extends Controller {
  constructor(
    @inject(BiometricService) private biometricService: BiometricService,
  ) {
    super();
  }

  /**
   * Регистрирует биометрические ключи с устройства
   */
  @Post("/register")
  async registerBiometric(
    @Body() body: IRegisterBiometricRequest,
  ): Promise<IRegisterBiometricResponse> {
    const { userId, deviceId, deviceName, publicKey } = body;

    await this.biometricService.registerBiometric(
      userId,
      deviceId,
      deviceName,
      publicKey,
    );

    return { registered: true };
  }

  /**
   * Генерирует nonce, который необходимо подписать на устройстве
   */
  @Post("/generate-nonce")
  async generateNonce(
    @Body() body: IGenerateNonceRequest,
  ): Promise<IGenerateNonceResponse> {
    return await this.biometricService.generateNonce(body.userId);
  }

  /**
   * Проверяет подпись и авторизует пользователя
   */
  @Post("/verify-signature")
  async verifySignature(
    @Body() body: IVerifyBiometricSignatureRequest,
  ): Promise<IVerifyBiometricSignatureResponse> {
    return await this.biometricService.verifyBiometricSignature(
      body.userId,
      body.deviceId,
      body.signature,
    );
  }
}
