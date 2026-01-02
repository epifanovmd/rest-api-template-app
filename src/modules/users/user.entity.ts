import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("user")
@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("varchar", { length: 255 })
  email: string;

  @Column("int")
  age: number;

  @Column("boolean", { default: true })
  isActive: boolean;

  @Column("decimal", {
    precision: 10,
    scale: 2,
  })
  salary: number;

  @Column("json")
  metadata: Record<string, any>;

  @Column("timestamp")
  birthDate: Date;
}

// src/modules/users/constants/user-roles.enum.ts
export enum UserRole {
  USER = "user",
  ADMIN = "admin",
  MODERATOR = "moderator",
}
