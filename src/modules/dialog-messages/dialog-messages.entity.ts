import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Dialog } from "../dialog/dialog.entity";
import { MessageFiles } from "../message-files/message-files.entity";
import { User } from "../user/user.entity";

@Entity("dialog_messages")
export class DialogMessages {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    name: "user_id",
    type: "uuid",
  })
  userId: string;

  @Column({
    name: "dialog_id",
    type: "uuid",
  })
  dialogId: string;

  @Column({
    type: "text",
    nullable: true,
  })
  text: string;

  @Column({
    type: "boolean",
    default: false,
  })
  system: boolean;

  @Column({
    type: "boolean",
    default: false,
  })
  sent: boolean;

  @Column({
    type: "boolean",
    default: false,
  })
  received: boolean;

  @Column({
    name: "reply_id",
    type: "uuid",
    nullable: true,
  })
  replyId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, user => user.id, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Dialog, dialog => dialog.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "dialog_id" })
  dialog: Dialog;

  @ManyToOne(() => DialogMessages, message => message.replies, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "reply_id" })
  reply: DialogMessages;

  @OneToMany(() => DialogMessages, message => message.reply)
  replies: DialogMessages[];

  @OneToMany(() => MessageFiles, messageFile => messageFile.message)
  messageFiles: MessageFiles[];

  // // Virtual getters for filtered files
  // get images(): Promise<Files[]> {
  //   return this.messageFiles.then(files =>
  //     files.filter(f => f.fileType === "image").map(f => f.file),
  //   );
  // }
  //
  // get videos(): Promise<Files[]> {
  //   return this.messageFiles.then(files =>
  //     files.filter(f => f.fileType === "video").map(f => f.file),
  //   );
  // }
  //
  // get audios(): Promise<Files[]> {
  //   return this.messageFiles.then(files =>
  //     files.filter(f => f.fileType === "audio").map(f => f.file),
  //   );
  // }
}
