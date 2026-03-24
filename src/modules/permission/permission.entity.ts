import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Role } from "../role/role.entity";
import { EPermissions } from "./permission.types";

/** Сущность разрешения (permission). Связывается с ролями и пользователями через ManyToMany. */
@Entity("permissions")
export class Permission {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Уникальный идентификатор разрешения из перечисления EPermissions
  @Column({ type: "enum", enum: EPermissions })
  name: EPermissions;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  // Связи
  @ManyToMany(() => Role, role => role.permissions)
  roles: Role[];

  /** Преобразовать сущность разрешения в DTO для передачи клиенту. */
  toDTO() {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
