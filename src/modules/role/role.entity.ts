import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Permission } from "../permission/permission.entity";
import { ERole } from "./role.types";

@Entity("roles")
export class Role {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "enum", enum: ERole })
  name: ERole;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Relations
  @ManyToMany(() => Permission, permission => permission.roles, { eager: true })
  @JoinTable({
    name: "role_permissions",
    joinColumn: { name: "role_id" },
    inverseJoinColumn: { name: "permission_id" },
  })
  permissions: Permission[];

  toDTO() {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      permissions: this.permissions?.map(permission => permission.toDTO()),
    };
  }
}
