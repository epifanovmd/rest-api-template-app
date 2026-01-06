import { injectable } from "inversify";

import { iocContainer } from "../../app.module";

export function Injectable() {
  return <T extends new (...args: any[]) => any>(constructor: T) => {
    iocContainer.bind(constructor).to(constructor).inSingletonScope();

    return injectable()(constructor);
  };
}
