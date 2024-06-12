import { Container } from "inversify";
import { Module } from "../../modules";
import { UtilsService } from "./utils.service";

export class UtilsModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(UtilsService).to(UtilsService).inSingletonScope();
  }
}
