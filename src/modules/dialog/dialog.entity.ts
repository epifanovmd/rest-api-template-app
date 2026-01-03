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

import { DialogMembers } from "../dialog-members/dialog-members.entity";
import { DialogMessages } from "../dialog-messages/dialog-messages.entity";
import { User } from "../user/user.entity";

@Entity("dialogs")
export class Dialog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "owner_id", type: "uuid" })
  ownerId: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, user => user.dialogMemberships)
  @JoinColumn({ name: "owner_id" })
  owner: User;

  @OneToMany(() => DialogMembers, member => member.dialog)
  members: DialogMembers[];

  @OneToMany(() => DialogMessages, message => message.dialog)
  messages: DialogMessages[];

  // Virtual fields for DTO
  lastMessage?: DialogMessages[];
  unreadMessagesCount?: number;

  toDTO() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      owner: this.owner?.toDTO(),
      members: this.members?.map(member => member.toDTO()),
      lastMessage: this.lastMessage,
      unreadMessagesCount: this.unreadMessagesCount,
    };
  }
}
