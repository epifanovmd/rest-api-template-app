import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "../user/user.entity";

@Entity("notification_settings")
@Index("IDX_NOTIFICATION_SETTINGS_USER", ["userId"], { unique: true })
export class NotificationSettings {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "user_id", type: "uuid", unique: true })
  userId: string;

  @Column({ name: "mute_all", type: "boolean", default: false })
  muteAll: boolean;

  @Column({ name: "sound_enabled", type: "boolean", default: true })
  soundEnabled: boolean;

  @Column({ name: "show_preview", type: "boolean", default: true })
  showPreview: boolean;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
