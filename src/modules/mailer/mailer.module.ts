import { Container } from "inversify";

import { Module } from "../../app.module";
import { MailerService } from "./mailer.service";

export class MailerModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(MailerService).to(MailerService).inSingletonScope();
  }
}
