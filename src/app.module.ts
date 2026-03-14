import "reflect-metadata";

import { decorate, injectable } from "inversify";
import Koa from "koa";
import { Controller } from "tsoa";
import { DataSource } from "typeorm";

import { iocContainer } from "./app.container";
import {
  AdminBootstrap,
  DatabaseBootstrap,
  SocketBootstrap,
} from "./bootstrap";
import { BOOTSTRAP, IBootstrap, TypeOrmDataSource } from "./core";
import { AuthModule } from "./modules/auth";
import { DialogSocketHandler } from "./modules/dialog";
import { ISocketHandler, SOCKET_HANDLER } from "./modules/socket";

export const loadAppModule = (koa: Koa) => {
  decorate(injectable(), Controller);

  iocContainer.bind(DataSource).toConstantValue(TypeOrmDataSource);
  iocContainer.bind<Koa>(Koa).toConstantValue(koa);

  new AuthModule(iocContainer).configure();

  // Socket handlers — добавляй сюда новые domain-хендлеры по мере роста
  iocContainer
    .bind<ISocketHandler>(SOCKET_HANDLER)
    .to(DialogSocketHandler)
    .inSingletonScope();

  // Bootstrappers
  iocContainer
    .bind<IBootstrap>(BOOTSTRAP)
    .to(DatabaseBootstrap)
    .inSingletonScope();
  iocContainer
    .bind<IBootstrap>(BOOTSTRAP)
    .to(SocketBootstrap)
    .inSingletonScope();
  iocContainer
    .bind<IBootstrap>(BOOTSTRAP)
    .to(AdminBootstrap)
    .inSingletonScope();
};
