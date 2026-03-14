import { Module } from "../../core/decorators/module.decorator";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  providers: [ProfileController, ProfileService],
})
export class ProfileModule {}
