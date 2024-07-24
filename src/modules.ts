import "reflect-metadata";

import { Container, decorate, injectable } from "inversify";
import { Controller } from "tsoa";

import { ServicesModule } from "./services";

decorate(injectable(), Controller);

export interface Module {
  Configure(ioc: Container): void;
}

export const iocContainer = new Container();

class AppModule implements Module {
  Configure(ioc: Container) {
    new ServicesModule().Configure(ioc);
  }
}

(() => {
  const appModule = new AppModule();

  appModule.Configure(iocContainer);
})();
