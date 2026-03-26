import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { Profile } from "../profile/profile.entity";

@Entity("files")
export class File {
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 40 })
  type: string;

  @Column({ type: "varchar", length: 120 })
  url: string;

  @Column({ type: "int" })
  size: number;

  @Column({ name: "thumbnail_url", type: "varchar", length: 120, nullable: true })
  thumbnailUrl: string | null;

  @Column({ type: "int", nullable: true })
  width: number | null;

  @Column({ type: "int", nullable: true })
  height: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @OneToMany(() => Profile, profile => profile.avatar)
  avatarProfiles: Profile[];

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
