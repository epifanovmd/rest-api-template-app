import { Container } from "inversify";

import { Module } from "../../app.module";
import { FcmTokenController } from "./fcm-token.controller";
import { FcmTokenService } from "./fcm-token.service";

export class FcmTokenModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(FcmTokenController).to(FcmTokenController).inSingletonScope();
    ioc.bind(FcmTokenService).to(FcmTokenService).inSingletonScope();
  }
}
