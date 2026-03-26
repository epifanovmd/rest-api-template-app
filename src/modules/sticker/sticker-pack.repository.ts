import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { StickerPack } from "./sticker-pack.entity";

@InjectableRepository(StickerPack)
export class StickerPackRepository extends BaseRepository<StickerPack> {
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        stickers: { file: true },
        creator: { profile: true },
      },
    });
  }

  async searchPacks(query: string, limit: number = 20, offset: number = 0) {
    return this.createQueryBuilder("pack")
      .leftJoinAndSelect("pack.stickers", "stickers")
      .leftJoinAndSelect("stickers.file", "file")
      .where(
        "(pack.name ILIKE :query OR pack.title ILIKE :query)",
        { query: `%${query}%` },
      )
      .orderBy("pack.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }

  async findFeatured(limit: number = 20, offset: number = 0) {
    return this.createQueryBuilder("pack")
      .leftJoinAndSelect("pack.stickers", "stickers")
      .leftJoinAndSelect("stickers.file", "file")
      .where("pack.isOfficial = true")
      .orderBy("pack.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }
}
