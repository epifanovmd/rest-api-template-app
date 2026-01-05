import { ObjectLiteral, Repository } from "typeorm";

import { IDataSource } from "../db";

export abstract class BaseRepository<
  T extends ObjectLiteral,
> extends Repository<T> {
  constructor(dataSource: IDataSource, entity: new () => T) {
    super(entity, dataSource.manager, dataSource.createQueryRunner());
  }

  createAndSave = (...args: Parameters<typeof this.save>) => {
    const entity = this.create(args[0]);

    return this.save(entity, args[1]);
  };
}
