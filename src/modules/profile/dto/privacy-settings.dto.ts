import { BaseDto } from "../../../core/dto/BaseDto";
import {
  EPrivacyLevel,
  PrivacySettings,
} from "../privacy-settings.entity";

export class PrivacySettingsDto extends BaseDto {
  showLastOnline: EPrivacyLevel;
  showPhone: EPrivacyLevel;
  showAvatar: EPrivacyLevel;

  constructor(entity: PrivacySettings) {
    super(entity);

    this.showLastOnline = entity.showLastOnline;
    this.showPhone = entity.showPhone;
    this.showAvatar = entity.showAvatar;
  }

  static fromEntity(entity: PrivacySettings) {
    return new PrivacySettingsDto(entity);
  }
}
