import { inject } from "inversify";

import { Injectable, logger } from "../../core";
import { DeviceTokenRepository } from "./device-token.repository";
import { DeviceTokenDto } from "./dto";
import { PushError } from "./push.errors";
import { EDevicePlatform } from "./push.types";

@Injectable()
export class DeviceTokenService {
  constructor(
    @inject(DeviceTokenRepository)
    private _tokenRepo: DeviceTokenRepository,
  ) {}

  /**
   * Привязать push-токен к пользователю и сессии. Токен, привязанный к
   * другому пользователю (устройство сменило владельца), сначала отвязывается.
   */
  async registerToken(
    userId: string,
    sessionId: string,
    token: string,
    platform: EDevicePlatform,
    deviceName?: string,
  ) {
    const existing = await this._tokenRepo.findByToken(token);

    if (existing?.userId === userId) {
      existing.sessionId = sessionId;
      existing.platform = platform;
      existing.deviceName = deviceName ?? existing.deviceName;
      await this._tokenRepo.save(existing);

      return DeviceTokenDto.fromEntity(existing);
    }

    if (existing) {
      await this._tokenRepo.delete({ id: existing.id });
      logger.info(
        { deviceTokenId: existing.id, fromUserId: existing.userId, userId },
        "Push-токен перепривязан к другому пользователю",
      );
    }

    const deviceToken = await this._tokenRepo.createAndSave({
      userId,
      sessionId,
      token,
      platform,
      deviceName: deviceName ?? null,
    });

    return DeviceTokenDto.fromEntity(deviceToken);
  }

  /** Отвязать свой токен; чужой или несуществующий — 404. */
  async unregisterToken(userId: string, token: string): Promise<void> {
    const existing = await this._tokenRepo.findByToken(token);

    if (!existing || existing.userId !== userId) {
      throw PushError.DEVICE_NOT_FOUND();
    }

    await this._tokenRepo.deleteByToken(token);
  }

  /** Удалить токены завершённой сессии. */
  async removeBySession(sessionId: string): Promise<void> {
    await this._tokenRepo.deleteBySessionId(sessionId);
  }

  async getTokensForUser(userId: string) {
    const tokens = await this._tokenRepo.findByUserId(userId);

    return tokens.map(DeviceTokenDto.fromEntity);
  }
}
