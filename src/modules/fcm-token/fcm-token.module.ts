import { Module } from "../../core/decorators/module.decorator";
import {
  SOCKET_EVENT_LISTENER,
} from "../socket/socket-event-listener.interface";
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
    { provide: SOCKET_EVENT_LISTENER, useClass: PushNotificationListener },
  ],
})
export class FcmTokenModule {}
