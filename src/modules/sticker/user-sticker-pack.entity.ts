import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "../user/user.entity";
import { StickerPack } from "./sticker-pack.entity";

@Entity("user_sticker_packs")
@Index("IDX_USER_STICKER_PACKS_UNIQUE", ["userId", "packId"], { unique: true })
export class UserStickerPack {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "pack_id", type: "uuid" })
  packId: string;

  @Column({
    name: "added_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  addedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => StickerPack, { onDelete: "CASCADE" })
  @JoinColumn({ name: "pack_id" })
  pack: StickerPack;
}
