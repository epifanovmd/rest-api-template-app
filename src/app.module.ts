import "reflect-metadata";

import { Container, decorate, injectable } from "inversify";
import { Controller } from "tsoa";
import { DataSource } from "typeorm";

import { TypeOrmDataSource } from "./core";

decorate(injectable(), Controller);

export const iocContainer = new Container();

iocContainer.bind(DataSource).toConstantValue(TypeOrmDataSource);
