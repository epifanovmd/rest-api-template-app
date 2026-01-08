import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import type { MessageFiles } from "../message-files/message-files.entity";
import type { Profile } from "../profile/profile.entity";

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

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  // @OneToMany(() => Profile, profile => profile.avatar)
  @OneToMany("Profile", "avatar")
  avatarProfiles: Profile[];

  // @OneToMany(() => MessageFiles, messageFile => messageFile.file)
  @OneToMany("MessageFiles", "file")
  messageFiles: MessageFiles[];

  toDTO() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      url: this.url,
      size: this.size,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
