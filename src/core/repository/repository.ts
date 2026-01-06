import { DataSource, ObjectLiteral, Repository } from "typeorm";

export abstract class BaseRepository<
  T extends ObjectLiteral,
> extends Repository<T> {
  constructor(private dataSource: DataSource, entity: new () => T) {
    super(entity, dataSource.manager, dataSource.createQueryRunner());
  }

  createAndSave = (...args: Parameters<typeof this.save>) => {
    const entity = this.create(args[0]);

    return this.save(entity, args[1]);
  };

  createQueryRunner() {
    return this.dataSource.createQueryRunner();
  }
}
