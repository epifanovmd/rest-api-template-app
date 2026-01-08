import "reflect-metadata";

import { decorate, injectable } from "inversify";
import { Controller } from "tsoa";
import { DataSource } from "typeorm";

import { iocContainer } from "./app.container";
import { TypeOrmDataSource } from "./core";

export const loadAppModule = () => {
  decorate(injectable(), Controller);

  iocContainer.bind(DataSource).toConstantValue(TypeOrmDataSource);
};
