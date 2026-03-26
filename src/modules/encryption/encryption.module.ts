import { Module } from "../../core";
import { asSocketHandler } from "../socket";
import { EncryptionController } from "./encryption.controller";
import { EncryptionHandler } from "./encryption.handler";
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
  ],
})
export class EncryptionModule {}
