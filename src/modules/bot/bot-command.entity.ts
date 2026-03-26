import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Bot } from "./bot.entity";

@Entity("bot_commands")
@Index("IDX_BOT_COMMANDS_BOT_CMD", ["botId", "command"], { unique: true })
export class BotCommand {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "bot_id", type: "uuid" })
  botId: string;

  @Column({ type: "varchar", length: 50 })
  command: string;

  @Column({ type: "varchar", length: 200 })
  description: string;

  @ManyToOne(() => Bot, bot => bot.commands, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
