import { inject } from "inversify";

import { Injectable } from "../../core";
import { DeviceTokenRepository } from "./device-token.repository";
import { DeviceTokenDto } from "./dto";
import { EDevicePlatform } from "./push.types";

@Injectable()
export class DeviceTokenService {
  constructor(
    @inject(DeviceTokenRepository)
    private _tokenRepo: DeviceTokenRepository,
  ) {}

  async registerToken(
    userId: string,
    token: string,
    platform: EDevicePlatform,
    deviceName?: string,
  ) {
    // Upsert: если токен уже существует, обновляем userId
    const existing = await this._tokenRepo.findByToken(token);

    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      existing.deviceName = deviceName ?? existing.deviceName;
      await this._tokenRepo.save(existing);

      return DeviceTokenDto.fromEntity(existing);
    }

    const deviceToken = await this._tokenRepo.createAndSave({
      userId,
      token,
      platform,
      deviceName: deviceName ?? null,
    });

    return DeviceTokenDto.fromEntity(deviceToken);
  }

  async unregisterToken(token: string) {
    await this._tokenRepo.deleteByToken(token);
  }

  async getTokensForUser(userId: string) {
    const tokens = await this._tokenRepo.findByUserId(userId);

    return tokens.map(DeviceTokenDto.fromEntity);
  }
}
