import { Container } from "inversify";

import { Module } from "../modules";
import { AuthModule } from "./auth";
import { FileModule } from "./file";
import { RedisModule } from "./redis";
import { SocketModule } from "./socket";
import { UtilsModule } from "./utils";

export class ServicesModule implements Module {
  Configure(ioc: Container) {
    new AuthModule().Configure(ioc);
    new FileModule().Configure(ioc);
    new RedisModule().Configure(ioc);
    new SocketModule().Configure(ioc);
    new UtilsModule().Configure(ioc);
  }
}
