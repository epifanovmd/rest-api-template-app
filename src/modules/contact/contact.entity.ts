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

import { User } from "../user/user.entity";
import { EContactStatus } from "./contact.types";

@Entity("contacts")
@Index("IDX_CONTACTS_USER_CONTACT", ["userId", "contactUserId"], {
  unique: true,
})
@Index("IDX_CONTACTS_CONTACT_USER", ["contactUserId", "userId"])
export class Contact {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "contact_user_id", type: "uuid" })
  contactUserId: string;

  @Column({ name: "display_name", type: "varchar", length: 80, nullable: true })
  displayName: string | null;

  @Column({
    type: "enum",
    enum: EContactStatus,
    default: EContactStatus.PENDING,
  })
  status: EContactStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "contact_user_id" })
  contactUser: User;
}
