import { Container } from "inversify";

import { Module } from "../../app.module";
import { DialogMessagesService } from "./dialog-messages.service";

export class DialogMessagesModule implements Module {
  Configure(ioc: Container) {
    ioc
      .bind(DialogMessagesService)
      .to(DialogMessagesService)
      .inSingletonScope();
  }
}
