import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable } from "../../core";
import { KoaRequest } from "../../types/koa";
import {
  IBiometricDevicesResponseDto,
  IDeleteBiometricResponseDto,
  IGenerateNonceRequestDto,
  IGenerateNonceResponseDto,
  IRegisterBiometricRequestDto,
  IRegisterBiometricResponseDto,
  IVerifyBiometricSignatureRequestDto,
  IVerifyBiometricSignatureResponseDto,
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
  @Security("jwt")
  @Post("/register")
  async registerBiometric(
    @Request() req: KoaRequest,
    @Body() body: IRegisterBiometricRequestDto,
  ): Promise<IRegisterBiometricResponseDto> {
    const { userId } = getContextUser(req);

    await this.biometricService.registerBiometric(
      userId,
      body.deviceId,
      body.deviceName,
      body.publicKey,
    );

    return { registered: true };
  }

  /**
   * Генерирует nonce, который необходимо подписать на устройстве
   */
  @Security("jwt")
  @Post("/generate-nonce")
  async generateNonce(
    @Request() req: KoaRequest,
    @Body() body: IGenerateNonceRequestDto,
  ): Promise<IGenerateNonceResponseDto> {
    const { userId } = getContextUser(req);

    return this.biometricService.generateNonce(userId, body.deviceId);
  }

  /**
   * Проверяет подпись и авторизует пользователя
   */
  @Security("jwt")
  @Post("/verify-signature")
  async verifySignature(
    @Request() req: KoaRequest,
    @Body() body: IVerifyBiometricSignatureRequestDto,
  ): Promise<IVerifyBiometricSignatureResponseDto> {
    const { userId } = getContextUser(req);

    return this.biometricService.verifyBiometricSignature(
      userId,
      body.deviceId,
      body.signature,
    );
  }

  /**
   * Список зарегистрированных устройств пользователя
   */
  @Security("jwt")
  @Get("/devices")
  async getDevices(
    @Request() req: KoaRequest,
  ): Promise<IBiometricDevicesResponseDto> {
    const { userId } = getContextUser(req);
    const devices = await this.biometricService.getDevices(userId);

    return {
      devices: devices.map(d => ({
        id: d.id,
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        lastUsedAt: d.lastUsedAt,
        createdAt: d.createdAt,
      })),
    };
  }

  /**
   * Удалить зарегистрированное устройство
   */
  @Security("jwt")
  @Delete("/{deviceId}")
  async deleteDevice(
    @Request() req: KoaRequest,
    @Path() deviceId: string,
  ): Promise<IDeleteBiometricResponseDto> {
    const { userId } = getContextUser(req);

    return this.biometricService.deleteDevice(userId, deviceId);
  }
}
