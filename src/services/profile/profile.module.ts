import { Container } from "inversify";

import { Module } from "../../modules";
// import { ProfileController } from "./profile.controller";
// import { ProfileService } from "./profile.service";

export class ProfileModule implements Module {
  Configure(ioc: Container) {
    // ioc.bind(ProfileController).to(ProfileController).inSingletonScope();
    // ioc.bind(ProfileService).to(ProfileService).inSingletonScope();
  }
}
