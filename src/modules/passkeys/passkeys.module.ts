import { Module } from "../../core";
import { PasskeysController } from "./passkeys.controller";
import { PasskeysRepository } from "./passkeys.repository";
import { PasskeysService } from "./passkeys.service";

@Module({
  providers: [PasskeysRepository, PasskeysController, PasskeysService],
})
export class PasskeysModule {}
