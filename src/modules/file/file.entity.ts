import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { MessageFiles } from "../message-files/message-files.entity";
import { Profile } from "../profile/profile.entity";

@Entity("files")
export class Files {
  @PrimaryColumn("uuid")
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 40 })
  type: string;

  @Column({ length: 120 })
  url: string;

  @Column("int")
  size: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @OneToMany(() => Profile, profile => profile.avatar)
  avatarProfiles: Profile[];

  @OneToMany(() => MessageFiles, messageFile => messageFile.file)
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
