import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { FcmTokenController } from "./fcm-token.controller";
import { FcmTokenService } from "./fcm-token.service";
import { PushNotificationListener } from "./push-notification.listener";

/**
 * FCM push-уведомления.
 * PushNotificationListener регистрируется как ISocketEventListener —
 * SocketBootstrap вызовет listener.register() при старте.
 */
@Module({
  providers: [
    FcmTokenController,
    FcmTokenService,
    asSocketListener(PushNotificationListener),
  ],
})
export class FcmTokenModule {}
