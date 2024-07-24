import { Container } from "inversify";

import { Module } from "../../modules";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

export class AuthModule implements Module {
  Configure(ioc: Container) {
    ioc.bind(AuthController).to(AuthController).inSingletonScope();
    ioc.bind(AuthService).to(AuthService).inSingletonScope();
  }
}
