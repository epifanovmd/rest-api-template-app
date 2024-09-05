import { Container } from "inversify";

import { Module } from "../../modules";
// import { RedisService } from "./redis.service";

export class RedisModule implements Module {
  Configure(ioc: Container) {
    // ioc.bind(RedisService).to(RedisService).inSingletonScope();
  }
}
