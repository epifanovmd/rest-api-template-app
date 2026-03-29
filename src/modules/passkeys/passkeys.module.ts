import { Module } from "../../core";
import { PasskeyChallengeRepository } from "./passkey-challenge.repository";
import { PasskeysController } from "./passkeys.controller";
import { PasskeysRepository } from "./passkeys.repository";
import { PasskeysService } from "./passkeys.service";

@Module({
  providers: [
    PasskeysRepository,
    PasskeyChallengeRepository,
    PasskeysService,
    PasskeysController,
  ],
})
export class PasskeysModule {}
