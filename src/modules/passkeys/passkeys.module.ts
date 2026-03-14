import { Module } from "../../core/decorators/module.decorator";
import { PasskeysController } from "./passkeys.controller";
import { PasskeysService } from "./passkeys.service";

@Module({
  providers: [PasskeysController, PasskeysService],
})
export class PasskeysModule {}
