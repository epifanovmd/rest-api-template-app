import { NotificationSettings } from "../notification-settings.entity";

export class NotificationSettingsChangedEvent {
  constructor(
    public readonly userId: string,
    public readonly settings: NotificationSettings,
  ) {}
}
