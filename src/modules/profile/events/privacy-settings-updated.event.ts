import { PrivacySettings } from "../privacy-settings.entity";

export class PrivacySettingsUpdatedEvent {
  constructor(
    public readonly userId: string,
    public readonly settings: PrivacySettings,
  ) {}
}
