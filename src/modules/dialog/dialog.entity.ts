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

import type { DialogMembers } from "../dialog-members/dialog-members.entity";
import type { DialogMessages } from "../dialog-messages/dialog-messages.entity";
import type { User } from "../user/user.entity";

@Entity("dialogs")
export class Dialog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "owner_id", type: "uuid" })
  ownerId: string;

  @Column({ name: "last_message_id", type: "uuid", nullable: true })
  lastMessageId: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  // @ManyToOne(() => User, user => user.id)
  @ManyToOne("User", "id")
  @JoinColumn({ name: "owner_id" })
  owner: User;

  // @OneToMany(() => DialogMembers, member => member.dialog, { cascade: true })
  @OneToMany("DialogMembers", "dialog", { cascade: true })
  members: DialogMembers[];

  // @OneToMany(() => DialogMessages, message => message.dialog, { cascade: true })
  @OneToMany("DialogMessages", "dialog", { cascade: true })
  messages: DialogMessages[];

  // @ManyToOne(() => DialogMessages, { nullable: true })
  @ManyToOne("DialogMessages", { nullable: true })
  @JoinColumn({ name: "last_message_id" })
  lastMessage: DialogMessages | null;
}
