import { BaseDto } from "../../../core/dto/BaseDto";
import { DeviceToken } from "../device-token.entity";
import { NotificationSettings } from "../notification-settings.entity";
import { EDevicePlatform } from "../push.types";

export class DeviceTokenDto extends BaseDto {
  id: string;
  token: string;
  platform: EDevicePlatform;
  deviceName: string | null;
  createdAt: Date;

  constructor(entity: DeviceToken) {
    super(entity);

    this.id = entity.id;
    this.token = entity.token;
    this.platform = entity.platform;
    this.deviceName = entity.deviceName;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: DeviceToken) {
    return new DeviceTokenDto(entity);
  }
}

export class NotificationSettingsDto extends BaseDto {
  muteAll: boolean;
  soundEnabled: boolean;
  showPreview: boolean;

  constructor(entity: NotificationSettings) {
    super(entity);

    this.muteAll = entity.muteAll;
    this.soundEnabled = entity.soundEnabled;
    this.showPreview = entity.showPreview;
  }

  static fromEntity(entity: NotificationSettings) {
    return new NotificationSettingsDto(entity);
  }
}
