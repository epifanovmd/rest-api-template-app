import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Dialog } from "../dialog/dialog.entity";
import { Files } from "../file/file.entity";
import { MessageFiles } from "../message-files/message-files.entity";
import { User } from "../user/user.entity";

@Entity("dialog_messages")
export class DialogMessages {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "dialog_id", type: "uuid" })
  dialogId: string;

  @Column({ type: "text", nullable: true })
  text: string;

  @Column({ default: false })
  system: boolean;

  @Column({ default: false })
  sent: boolean;

  @Column({ default: false })
  received: boolean;

  @Column({ name: "reply_id", type: "uuid", nullable: true })
  replyId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, user => user.messages)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Dialog, dialog => dialog.messages)
  @JoinColumn({ name: "dialog_id" })
  dialog: Dialog;

  @ManyToOne(() => DialogMessages, message => message.replies)
  @JoinColumn({ name: "reply_id" })
  reply: DialogMessages;

  @OneToMany(() => DialogMessages, message => message.reply)
  replies: DialogMessages[];

  // Files relations
  @ManyToMany(() => Files)
  @JoinTable({
    name: "message_files",
    joinColumn: { name: "message_id" },
    inverseJoinColumn: { name: "file_id" },
  })
  images: Files[];

  @ManyToMany(() => Files)
  @JoinTable({
    name: "message_files",
    joinColumn: { name: "message_id" },
    inverseJoinColumn: { name: "file_id" },
  })
  videos: Files[];

  @ManyToMany(() => Files)
  @JoinTable({
    name: "message_files",
    joinColumn: { name: "message_id" },
    inverseJoinColumn: { name: "file_id" },
  })
  audios: Files[];

  // Custom file type handling through MessageFiles
  @OneToMany(() => MessageFiles, messageFile => messageFile.message)
  messageFiles: MessageFiles[];

  toDTO() {
    return {
      id: this.id,
      userId: this.userId,
      dialogId: this.dialogId,
      text: this.text,
      system: this.system,
      sent: this.sent,
      received: this.received,
      replyId: this.replyId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      user: this.user?.toDTO(),
      images: this.images?.map(image => image.toDTO()),
      videos: this.videos?.map(video => video.toDTO()),
      audios: this.audios?.map(audio => audio.toDTO()),
      reply: this.reply?.toDTO(),
    };
  }
}
