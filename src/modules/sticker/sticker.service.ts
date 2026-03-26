import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { inject } from "inversify";

import { Injectable } from "../../core";
import { StickerPackDto } from "./dto";
import { StickerRepository } from "./sticker.repository";
import { StickerPackRepository } from "./sticker-pack.repository";
import { UserStickerPackRepository } from "./user-sticker-pack.repository";

@Injectable()
export class StickerService {
  constructor(
    @inject(StickerPackRepository) private _packRepo: StickerPackRepository,
    @inject(StickerRepository) private _stickerRepo: StickerRepository,
    @inject(UserStickerPackRepository)
    private _userPackRepo: UserStickerPackRepository,
  ) {}

  async createPack(
    userId: string,
    data: { name: string; title: string; isAnimated?: boolean },
  ) {
    const existing = await this._packRepo.findOne({
      where: { name: data.name },
    });

    if (existing) {
      throw new BadRequestException("Набор стикеров с таким именем уже существует");
    }

    const pack = this._packRepo.create({
      name: data.name,
      title: data.title,
      creatorId: userId,
      isAnimated: data.isAnimated ?? false,
    });

    const saved = await this._packRepo.save(pack);
    const full = await this._packRepo.findById(saved.id);

    return StickerPackDto.fromEntity(full!);
  }

  async addStickerToPack(
    packId: string,
    userId: string,
    data: { emoji?: string; fileId: string },
  ) {
    const pack = await this._packRepo.findById(packId);

    if (!pack) {
      throw new NotFoundException("Набор стикеров не найден");
    }

    if (pack.creatorId !== userId) {
      throw new ForbiddenException("Только создатель может добавлять стикеры");
    }

    const maxPosition = await this._stickerRepo.getMaxPosition(packId);

    const sticker = this._stickerRepo.create({
      packId,
      emoji: data.emoji ?? null,
      fileId: data.fileId,
      position: maxPosition + 1,
    });

    await this._stickerRepo.save(sticker);

    const updatedPack = await this._packRepo.findById(packId);

    return StickerPackDto.fromEntity(updatedPack!);
  }

  async removeStickerFromPack(stickerId: string, userId: string) {
    const sticker = await this._stickerRepo.findById(stickerId);

    if (!sticker) {
      throw new NotFoundException("Стикер не найден");
    }

    if (sticker.pack && sticker.pack.creatorId !== userId) {
      throw new ForbiddenException("Только создатель может удалять стикеры");
    }

    await this._stickerRepo.delete({ id: stickerId });
  }

  async getPackById(packId: string) {
    const pack = await this._packRepo.findById(packId);

    if (!pack) {
      throw new NotFoundException("Набор стикеров не найден");
    }

    return StickerPackDto.fromEntity(pack);
  }

  async searchPacks(query: string, limit?: number, offset?: number) {
    const [packs, totalCount] = await this._packRepo.searchPacks(
      query,
      limit ?? 20,
      offset ?? 0,
    );

    return {
      data: packs.map(StickerPackDto.fromEntity),
      totalCount,
    };
  }

  async getFeaturedPacks(limit?: number, offset?: number) {
    const [packs, totalCount] = await this._packRepo.findFeatured(
      limit ?? 20,
      offset ?? 0,
    );

    return {
      data: packs.map(StickerPackDto.fromEntity),
      totalCount,
    };
  }

  async addPackToUser(userId: string, packId: string) {
    const pack = await this._packRepo.findById(packId);

    if (!pack) {
      throw new NotFoundException("Набор стикеров не найден");
    }

    const existing = await this._userPackRepo.findByUserAndPack(userId, packId);

    if (existing) {
      throw new BadRequestException("Набор стикеров уже добавлен");
    }

    await this._userPackRepo.createAndSave({
      userId,
      packId,
    });
  }

  async removePackFromUser(userId: string, packId: string) {
    const existing = await this._userPackRepo.findByUserAndPack(userId, packId);

    if (!existing) {
      throw new NotFoundException("Набор стикеров не найден в вашей коллекции");
    }

    await this._userPackRepo.delete({ id: existing.id });
  }

  async getUserPacks(userId: string) {
    const userPacks = await this._userPackRepo.findByUser(userId);

    return userPacks
      .filter(up => up.pack)
      .map(up => StickerPackDto.fromEntity(up.pack));
  }
}
