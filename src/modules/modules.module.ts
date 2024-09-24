import { Container } from "inversify";

import { Module } from "../app.module";
import { AuthModule } from "./auth";
import { FileModule } from "./file";
import { ProfileModule } from "./profile";
import { RedisModule } from "./redis";
import { SocketModule } from "./socket";
import { UtilsModule } from "./utils";

export class ModulesModule implements Module {
  Configure(ioc: Container) {
    new AuthModule().Configure(ioc);
    new ProfileModule().Configure(ioc);
    new FileModule().Configure(ioc);
    new RedisModule().Configure(ioc);
    new SocketModule().Configure(ioc);
    new UtilsModule().Configure(ioc);
  }
}
