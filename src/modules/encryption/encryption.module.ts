import { Module } from "../../core";
import { asSocketHandler, asSocketListener } from "../socket";
import { EncryptionController } from "./encryption.controller";
import { EncryptionHandler } from "./encryption.handler";
import { EncryptionListener } from "./encryption.listener";
import { EncryptionService } from "./encryption.service";
import { OneTimePreKeyRepository } from "./one-time-prekey.repository";
import { UserKeyRepository } from "./user-key.repository";

@Module({
  providers: [
    UserKeyRepository,
    OneTimePreKeyRepository,
    EncryptionService,
    EncryptionController,
    asSocketHandler(EncryptionHandler),
    asSocketListener(EncryptionListener),
  ],
})
export class EncryptionModule {}
