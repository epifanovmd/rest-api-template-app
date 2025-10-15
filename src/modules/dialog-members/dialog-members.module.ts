import { Container } from "inversify";

import { Module } from "../../app.module";
import { DialogMembersService } from "./dialog-members.service";

export class DialogMembersModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(DialogMembersService).to(DialogMembersService).inSingletonScope();
  }
}
