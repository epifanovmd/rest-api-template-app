import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { DeviceController } from "./device.controller";
import { DeviceTokenRepository } from "./device-token.repository";
import { DeviceTokenService } from "./device-token.service";
import { NotificationSettingsController } from "./notification-settings.controller";
import { NotificationSettingsRepository } from "./notification-settings.repository";
import { NotificationSettingsService } from "./notification-settings.service";
import { PushListener } from "./push.listener";
import { PushService } from "./push.service";

@Module({
  providers: [
    DeviceTokenRepository,
    NotificationSettingsRepository,
    PushService,
    DeviceTokenService,
    NotificationSettingsService,
    DeviceController,
    NotificationSettingsController,
    asSocketListener(PushListener),
  ],
})
export class PushModule {}
