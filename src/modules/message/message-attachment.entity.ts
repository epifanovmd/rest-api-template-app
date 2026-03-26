import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { File } from "../file/file.entity";
import { Message } from "./message.entity";

@Entity("message_attachments")
@Index("IDX_MSG_ATTACHMENTS_MESSAGE", ["messageId"])
export class MessageAttachment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "message_id", type: "uuid" })
  messageId: string;

  @Column({ name: "file_id", type: "uuid" })
  fileId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => Message, msg => msg.attachments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "message_id" })
  message: Message;

  @ManyToOne(() => File, { onDelete: "CASCADE", eager: true })
  @JoinColumn({ name: "file_id" })
  file: File;
}
