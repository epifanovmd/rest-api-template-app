import { BaseDto } from "../../../core/dto/BaseDto";
import { Sticker } from "../sticker.entity";
import { StickerPack } from "../sticker-pack.entity";

export class StickerDto extends BaseDto {
  id: string;
  packId: string;
  emoji: string | null;
  fileId: string;
  fileUrl: string;
  position: number;
  createdAt: Date;

  constructor(entity: Sticker) {
    super(entity);

    this.id = entity.id;
    this.packId = entity.packId;
    this.emoji = entity.emoji;
    this.fileId = entity.fileId;
    this.fileUrl = entity.file?.url ?? "";
    this.position = entity.position;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: Sticker) {
    return new StickerDto(entity);
  }
}

export class StickerPackDto extends BaseDto {
  id: string;
  name: string;
  title: string;
  creatorId: string | null;
  isOfficial: boolean;
  isAnimated: boolean;
  stickers: StickerDto[];
  createdAt: Date;
  updatedAt: Date;

  constructor(entity: StickerPack) {
    super(entity);

    this.id = entity.id;
    this.name = entity.name;
    this.title = entity.title;
    this.creatorId = entity.creatorId;
    this.isOfficial = entity.isOfficial;
    this.isAnimated = entity.isAnimated;
    this.stickers =
      entity.stickers
        ?.sort((a, b) => a.position - b.position)
        .map(StickerDto.fromEntity) ?? [];
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }

  static fromEntity(entity: StickerPack) {
    return new StickerPackDto(entity);
  }
}
