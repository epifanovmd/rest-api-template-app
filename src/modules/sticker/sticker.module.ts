import { Module } from "../../core";
import { StickerController } from "./sticker.controller";
import { StickerRepository } from "./sticker.repository";
import { StickerService } from "./sticker.service";
import { StickerPackRepository } from "./sticker-pack.repository";
import { UserStickerPackRepository } from "./user-sticker-pack.repository";

@Module({
  providers: [
    StickerPackRepository,
    StickerRepository,
    UserStickerPackRepository,
    StickerService,
    StickerController,
  ],
})
export class StickerModule {}
