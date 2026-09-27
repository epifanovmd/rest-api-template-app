import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { bigintNumber } from "../../core/db/transformers";
import { User } from "../user/user.entity";
import { EFileStatus } from "./file.types";

@Entity("files")
@Index("IDX_FILES_OWNER", ["ownerId"])
@Index("IDX_FILES_STATUS_CREATED", ["status", "createdAt"])
export class File {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  /**
   * Кто загрузил файл. `null` — файл принадлежит предметной области (кадр,
   * модель) или владелец удалён: такой файл живёт, пока на него ссылаются
   * (пробы использования), иначе его собирает `file.gc`.
   */
  @Column({ name: "owner_id", type: "uuid", nullable: true })
  ownerId!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "owner_id" })
  owner!: User | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 127 })
  type!: string;

  /** Размер оригинала, байт. */
  @Column({ type: "bigint", transformer: bigintNumber })
  size!: number;

  @Column({ type: "enum", enum: EFileStatus, default: EFileStatus.Ready })
  status!: EFileStatus;

  /** Ключ оригинала в хранилище (`files/<id>/original.<ext>`). */
  @Column({ type: "varchar", length: 1024 })
  key!: string;

  /** Оптимизированная версия для показа: webp изображения, m4a аудио. */
  @Column({
    name: "optimized_key",
    type: "varchar",
    length: 1024,
    nullable: true,
  })
  optimizedKey!: string | null;

  @Column({
    name: "thumbnail_key",
    type: "varchar",
    length: 1024,
    nullable: true,
  })
  thumbnailKey!: string | null;

  @Column({ name: "medium_key", type: "varchar", length: 1024, nullable: true })
  mediumKey!: string | null;

  @Column({ type: "int", nullable: true })
  width!: number | null;

  @Column({ type: "int", nullable: true })
  height!: number | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  blurhash!: string | null;

  @Column({ type: "float", nullable: true })
  duration!: number | null;

  @Column({ type: "simple-json", nullable: true })
  waveform!: number[] | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
