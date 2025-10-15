import { Container } from "inversify";

import { Module } from "../../app.module";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

export class UserModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(UserController).to(UserController).inSingletonScope();
    ioc.bind(UserService).to(UserService).inSingletonScope();
  }
}
