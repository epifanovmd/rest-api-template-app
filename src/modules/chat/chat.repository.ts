import { EntityManager } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Chat } from "./chat.entity";
import { EChatMemberRole, EChatType } from "./chat.types";

/** Экранирует спецсимволы LIKE/ILIKE (`%`, `_`, `\`) в пользовательском запросе. */
export const escapeLikePattern = (value: string) =>
  value.replace(/[\\%_]/g, ch => `\\${ch}`);

/** Детерминированный ключ пары пользователей для direct-чата. */
export const buildDirectKey = (userA: string, userB: string) =>
  [userA, userB].sort().join(":");

@InjectableRepository(Chat)
export class ChatRepository extends BaseRepository<Chat> {
  /** Полная загрузка чата с members, avatar, lastMessageSender — для отдачи клиенту. */
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        members: { user: { profile: { avatar: true } } },
        avatar: true,
        lastMessageSender: { profile: true },
      },
    });
  }

  /** Лёгкая загрузка чата без members — для проверок и валидаций. */
  async findByIdLight(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        avatar: true,
        lastMessageSender: { profile: true },
      },
    });
  }

  async findDirectChat(userId1: string, userId2: string) {
    return this.findOne({
      where: { directKey: buildDirectKey(userId1, userId2) },
    });
  }

  /**
   * Вставка direct-чата с `ON CONFLICT DO NOTHING` по `direct_key`.
   * `null` — чат этой пары уже создан параллельным запросом.
   */
  async insertDirectChat(
    directKey: string,
    createdById: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const repo = manager ? manager.getRepository(Chat) : this;
    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(Chat)
      .values({ type: EChatType.DIRECT, directKey, name: null, createdById })
      .orIgnore()
      .returning("id")
      .execute();
    const rows = (result.raw ?? []) as Array<{ id: string }>;

    return rows[0]?.id ?? null;
  }

  /**
   * Чаты пользователя со своим членством в `chat.members` (ровно один элемент).
   * Скрытые direct-чаты (`hiddenAt`) не попадают. Остальные участники
   * загружаются отдельно превью-выборкой, чтобы не тянуть все подписки канала.
   */
  async findUserChats(userId: string, offset?: number, limit?: number) {
    const qb = this.createQueryBuilder("chat")
      .innerJoinAndSelect("chat.members", "me", "me.userId = :userId", {
        userId,
      })
      .leftJoin("me.user", "meUser")
      .addSelect(["meUser.id", "meUser.username"])
      .leftJoinAndSelect("meUser.profile", "meProfile")
      .leftJoinAndSelect("meProfile.avatar", "meProfileAvatar")
      .leftJoinAndSelect("chat.avatar", "avatar")
      .leftJoinAndSelect("chat.lastMessageSender", "lastMsgSender")
      .leftJoinAndSelect("lastMsgSender.profile", "lastMsgSenderProfile")
      .where("me.hiddenAt IS NULL")
      .orderBy("chat.lastMessageAt", "DESC", "NULLS LAST")
      .addOrderBy("chat.createdAt", "DESC");

    if (offset !== undefined) {
      qb.skip(offset);
    }
    if (limit !== undefined) {
      qb.take(limit);
    }

    return qb.getManyAndCount();
  }

  async findPublicChannels(query?: string, offset?: number, limit?: number) {
    const qb = this.createQueryBuilder("chat")
      .leftJoinAndSelect("chat.avatar", "avatar")
      .where("chat.type = :type", { type: EChatType.CHANNEL })
      .andWhere("chat.isPublic = true")
      .orderBy("chat.createdAt", "DESC");

    if (query) {
      qb.andWhere(
        "(chat.name ILIKE :q ESCAPE '\\' OR chat.username ILIKE :q ESCAPE '\\')",
        { q: `%${escapeLikePattern(query)}%` },
      );
    }

    if (offset !== undefined) qb.skip(offset);
    if (limit !== undefined) qb.take(limit);

    return qb.getManyAndCount();
  }

  async findByUsername(username: string) {
    return this.findOne({
      where: { username },
      relations: {
        members: { user: { profile: { avatar: true } } },
        avatar: true,
        lastMessageSender: { profile: true },
      },
    });
  }

  /** Чаты без единого участника (после каскадного удаления пользователя). */
  async findOrphanChatIds(): Promise<string[]> {
    const rows = await this.createQueryBuilder("chat")
      .select("chat.id", "id")
      .where(
        "NOT EXISTS (SELECT 1 FROM chat_members m WHERE m.chat_id = chat.id)",
      )
      .getRawMany<{ id: string }>();

    return rows.map(r => r.id);
  }

  /** Группы и каналы, оставшиеся без владельца. */
  async findChatIdsWithoutOwner(): Promise<string[]> {
    const rows = await this.createQueryBuilder("chat")
      .select("chat.id", "id")
      .where("chat.type IN (:...types)", {
        types: [EChatType.GROUP, EChatType.CHANNEL],
      })
      .andWhere(
        "NOT EXISTS (SELECT 1 FROM chat_members m WHERE m.chat_id = chat.id AND m.role = :owner)",
        { owner: EChatMemberRole.OWNER },
      )
      .getRawMany<{ id: string }>();

    return rows.map(r => r.id);
  }
}
