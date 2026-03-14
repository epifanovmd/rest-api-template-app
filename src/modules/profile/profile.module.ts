import { Module } from "../../core/decorators/module.decorator";
import { ProfileController } from "./profile.controller";
import { ProfileRepository } from "./profile.repository";
import { ProfileService } from "./profile.service";

@Module({
  providers: [ProfileRepository, ProfileController, ProfileService],
})
export class ProfileModule {}
