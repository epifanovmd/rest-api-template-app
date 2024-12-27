import { Container } from "inversify";

import { Module } from "../../app.module";
import { OtpService } from "./otp.service";

export class OtpModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(OtpService).to(OtpService).inSingletonScope();
  }
}
