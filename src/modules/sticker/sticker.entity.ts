import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { File } from "../file/file.entity";
import { StickerPack } from "./sticker-pack.entity";

@Entity("stickers")
export class Sticker {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "pack_id", type: "uuid" })
  packId: string;

  @Column({ type: "varchar", length: 10, nullable: true })
  emoji: string | null;

  @Column({ name: "file_id", type: "uuid" })
  fileId: string;

  @Column({ type: "int" })
  position: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => StickerPack, pack => pack.stickers, { onDelete: "CASCADE" })
  @JoinColumn({ name: "pack_id" })
  pack: StickerPack;

  @ManyToOne(() => File, { onDelete: "CASCADE", eager: true })
  @JoinColumn({ name: "file_id" })
  file: File;
}
