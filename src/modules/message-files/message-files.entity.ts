import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { DialogMessages } from "../dialog-messages/dialog-messages.entity";
import { Files } from "../file/file.entity";

export type TMessageFileType = "image" | "video" | "audio";

@Entity("message_files")
export class MessageFiles {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "message_id", type: "uuid" })
  messageId: string;

  @Column({ name: "file_id", type: "uuid" })
  fileId: string;

  @Column({
    name: "file_type",
    type: "enum",
    enum: ["image", "video", "audio"],
  })
  fileType: TMessageFileType;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => DialogMessages, message => message.messageFiles)
  @JoinColumn({ name: "message_id" })
  message: DialogMessages;

  @ManyToOne(() => Files, file => file.messageFiles)
  @JoinColumn({ name: "file_id" })
  file: Files;

  toDTO() {
    return {
      id: this.id,
      messageId: this.messageId,
      fileId: this.fileId,
      fileType: this.fileType,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      file: this.file?.toDTO(),
    };
  }
}
