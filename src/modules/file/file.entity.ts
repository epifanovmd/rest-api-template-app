import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("files")
export class File {
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 127 })
  type: string;

  @Column({ type: "varchar", length: 2048 })
  url: string;

  @Column({ type: "int" })
  size: number;

  @Column({ name: "thumbnail_url", type: "varchar", length: 2048, nullable: true })
  thumbnailUrl: string | null;

  @Column({ type: "int", nullable: true })
  width: number | null;

  @Column({ type: "int", nullable: true })
  height: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  toDTO() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      url: this.url,
      size: this.size,
      thumbnailUrl: this.thumbnailUrl,
      width: this.width,
      height: this.height,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
