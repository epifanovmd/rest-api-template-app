import { Container } from "inversify";

import { Module } from "../../app.module";
import { UtilsService } from "./utils.service";

export class UtilsModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(UtilsService).to(UtilsService).inSingletonScope();
  }
}
