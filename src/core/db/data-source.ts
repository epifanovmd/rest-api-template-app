import { createServiceDecorator } from "@force-dev/utils";

import { TypeOrmDataSource } from "./typeorm";

export type IDataSource = typeof TypeOrmDataSource;
export const IDataSource = createServiceDecorator<IDataSource>();

IDataSource.toConstantValue(TypeOrmDataSource);
