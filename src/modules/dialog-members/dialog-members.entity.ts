import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Dialog } from "../dialog/dialog.entity";
import { User } from "../user/user.entity";

@Entity("dialog_members")
@Index("IDX_DIALOG_MEMBERS_USER_DIALOG", ["userId", "dialogId"], {
  unique: true,
})
export class DialogMembers {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "dialog_id", type: "uuid" })
  dialogId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, user => user.id, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Dialog, dialog => dialog.members, { onDelete: "CASCADE" })
  @JoinColumn({ name: "dialog_id" })
  dialog: Dialog;
}
