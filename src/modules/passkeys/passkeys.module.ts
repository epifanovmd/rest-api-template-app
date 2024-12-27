import { Container } from "inversify";

import { Module } from "../../app.module";
import { PasskeysController } from "./passkeys.controller";
import { PasskeysService } from "./passkeys.service";

export class PasskeysModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(PasskeysController).to(PasskeysController).inSingletonScope();
    ioc.bind(PasskeysService).to(PasskeysService).inSingletonScope();
  }
}
