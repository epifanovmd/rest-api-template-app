import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import type { DialogMessages } from "../dialog-messages/dialog-messages.entity";
import type { File } from "../file/file.entity";

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
  // @ManyToOne(() => DialogMessages, message => message.messageFiles, {
  @ManyToOne("DialogMessages", "messageFiles", {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "message_id" })
  message: DialogMessages;

  // @ManyToOne(() => File, file => file.messageFiles, { onDelete: "CASCADE" })
  @ManyToOne("File", "messageFiles", { onDelete: "CASCADE" })
  @JoinColumn({ name: "file_id" })
  file: File;

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
