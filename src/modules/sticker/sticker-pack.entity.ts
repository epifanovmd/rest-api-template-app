import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "../user/user.entity";
import { Sticker } from "./sticker.entity";

@Entity("sticker_packs")
export class StickerPack {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 100, unique: true })
  name: string;

  @Column({ type: "varchar", length: 200 })
  title: string;

  @Column({ name: "creator_id", type: "uuid" })
  creatorId: string;

  @Column({ name: "is_official", type: "boolean", default: false })
  isOfficial: boolean;

  @Column({ name: "is_animated", type: "boolean", default: false })
  isAnimated: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "creator_id" })
  creator: User;

  @OneToMany(() => Sticker, sticker => sticker.pack, {
    cascade: true,
    eager: true,
  })
  stickers: Sticker[];
}
