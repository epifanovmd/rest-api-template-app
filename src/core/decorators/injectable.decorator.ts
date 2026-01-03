import { iocContainer } from "@force-dev/utils";
import { injectable } from "inversify";

export function Injectable() {
  return <T extends new (...args: any[]) => any>(constructor: T) => {
    iocContainer.bind(constructor).to(constructor).inSingletonScope();

    return injectable()(constructor);
  };
}
