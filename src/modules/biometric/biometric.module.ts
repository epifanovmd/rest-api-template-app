import { Container } from "inversify";

import { Module } from "../../app.module";
import { BiometricController } from "./biometric.controller";
import { BiometricService } from "./biometric.service";

export class BiometricModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(BiometricController).to(BiometricController).inSingletonScope();
    ioc.bind(BiometricService).to(BiometricService).inSingletonScope();
  }
}
