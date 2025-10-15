import { Container } from "inversify";

import { Module } from "../../app.module";
import { DialogController } from "./dialog.controller";
import { DialogService } from "./dialog.service";

export class DialogModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(DialogController).to(DialogController).inSingletonScope();
    ioc.bind(DialogService).to(DialogService).inSingletonScope();
  }
}
