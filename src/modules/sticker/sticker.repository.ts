import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Sticker } from "./sticker.entity";

@InjectableRepository(Sticker)
export class StickerRepository extends BaseRepository<Sticker> {
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: { file: true, pack: true },
    });
  }

  async getMaxPosition(packId: string): Promise<number> {
    const result = await this.createQueryBuilder("sticker")
      .where("sticker.packId = :packId", { packId })
      .select("MAX(sticker.position)", "maxPosition")
      .getRawOne();

    return result?.maxPosition ?? -1;
  }
}
