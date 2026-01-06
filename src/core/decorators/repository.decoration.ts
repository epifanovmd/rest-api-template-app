import { injectable } from "inversify";
import { DataSource } from "typeorm";

import { iocContainer } from "../../app.module";

export const InjectableRepository = <T>(entity: new () => T) => {
  return <T extends new (...args: any[]) => any>(constructor: T) => {
    iocContainer.bind(constructor).toDynamicValue(context => {
      return new constructor(context.container.get(DataSource), entity);
    });

    return injectable()(constructor);
  };
};
