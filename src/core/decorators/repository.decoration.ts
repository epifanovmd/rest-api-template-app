import { iocContainer } from "@force-dev/utils";
import { injectable } from "inversify";

import { IDataSource } from "../db";

export const InjectableRepository = <T>(entity: new () => T) => {
  return <T extends new (...args: any[]) => any>(constructor: T) => {
    iocContainer.bind(constructor).toDynamicValue(() => {
      return new constructor(IDataSource.getInstance(), entity);
    });

    return injectable()(constructor);
  };
};
