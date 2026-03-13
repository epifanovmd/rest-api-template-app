import "reflect-metadata";

import { decorate, injectable } from "inversify";
import Koa from "koa";
import { Controller } from "tsoa";
import { DataSource } from "typeorm";

import { iocContainer } from "./app.container";
import { AdminBootstrap, DatabaseBootstrap, SocketBootstrap } from "./bootstrap";
import { BOOTSTRAP, IBootstrap, TypeOrmDataSource } from "./core";

export const loadAppModule = (koa: Koa) => {
  decorate(injectable(), Controller);

  iocContainer.bind(DataSource).toConstantValue(TypeOrmDataSource);
  iocContainer.bind<Koa>(Koa).toConstantValue(koa);

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
