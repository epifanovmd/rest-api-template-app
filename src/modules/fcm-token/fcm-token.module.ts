import { Module } from "../../core";
import { asSocketListener } from "../socket";
import { FcmTokenController } from "./fcm-token.controller";
import { FcmTokenRepository } from "./fcm-token.repository";
import { FcmTokenService } from "./fcm-token.service";
import { PushNotificationListener } from "./push-notification.listener";

@Module({
  providers: [
    FcmTokenRepository,
    FcmTokenController,
    FcmTokenService,
    asSocketListener(PushNotificationListener),
  ],
})
export class FcmTokenModule {}
