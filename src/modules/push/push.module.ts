import { asJobHandler, Module } from "../../core";
import { asSocketListener } from "../socket";
import { DeviceController } from "./device.controller";
import { DeviceToken } from "./device-token.entity";
import { DeviceTokenRepository } from "./device-token.repository";
import { DeviceTokenService } from "./device-token.service";
import { NotificationSettingsController } from "./notification-settings.controller";
import { NotificationSettings } from "./notification-settings.entity";
import { NotificationSettingsRepository } from "./notification-settings.repository";
import { NotificationSettingsService } from "./notification-settings.service";
import { PushListener } from "./push.listener";
import { PushService } from "./push.service";
import { PushSendJob } from "./push-send.job";

@Module({
  entities: [DeviceToken, NotificationSettings],
  providers: [
    DeviceTokenRepository,
    NotificationSettingsRepository,
    PushService,
    DeviceTokenService,
    NotificationSettingsService,
    DeviceController,
    NotificationSettingsController,
    asSocketListener(PushListener),
    asJobHandler(PushSendJob),
  ],
})
export class PushModule {}
