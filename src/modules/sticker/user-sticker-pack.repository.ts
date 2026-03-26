import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { UserStickerPack } from "./user-sticker-pack.entity";

@InjectableRepository(UserStickerPack)
export class UserStickerPackRepository extends BaseRepository<UserStickerPack> {
  async findByUser(userId: string) {
    return this.find({
      where: { userId },
      relations: {
        pack: { stickers: { file: true } },
      },
      order: { addedAt: "DESC" },
    });
  }

  async findByUserAndPack(userId: string, packId: string) {
    return this.findOne({
      where: { userId, packId },
    });
  }
}
