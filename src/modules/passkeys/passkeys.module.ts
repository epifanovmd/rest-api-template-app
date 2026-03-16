import { Module } from "../../core";
import { PasskeysController } from "./passkeys.controller";
import { PasskeysRepository } from "./passkeys.repository";
import { PasskeysService } from "./passkeys.service";

@Module({
  providers: [PasskeysRepository, PasskeysService, PasskeysController],
})
export class PasskeysModule {}
