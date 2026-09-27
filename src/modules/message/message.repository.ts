import { SelectQueryBuilder } from "typeorm";

import { BaseRepository, InjectableRepository } from "../../core";
import { Message } from "./message.entity";

/** Экранирует спецсимволы LIKE/ILIKE (`%`, `_`, `\`) в пользовательском запросе. */
export const escapeLikePattern = (value: string) =>
  value.replace(/[\\%_]/g, ch => `\\${ch}`);

/** Позиция сообщения в ленте для keyset-пагинации. */
export interface IMessageKey {
  createdAt: Date;
  id: string;
}

@InjectableRepository(Message)
export class MessageRepository extends BaseRepository<Message> {
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        sender: { profile: { avatar: true } },
        replyTo: { sender: { profile: { avatar: true } } },
        attachments: { file: true },
        reactions: true,
        mentions: true,
      },
    });
  }

  /**
   * Сообщения старше ключа (без ключа — последние), от новых к старым.
   * Keyset по (createdAt, id): одинаковое время не теряет и не дублирует строки.
   */
  async findOlder(
    chatId: string,
    userId: string,
    before: IMessageKey | null,
    limit: number,
  ) {
    const qb = this._baseMessageQuery("message", userId)
      .andWhere("message.chatId = :chatId", { chatId })
      .orderBy("message.createdAt", "DESC")
      .addOrderBy("message.id", "DESC")
      .take(limit + 1);

    if (before) {
      qb.andWhere("(message.createdAt, message.id) < (:keyAt, :keyId)", {
        keyAt: before.createdAt,
        keyId: before.id,
      });
    }

    const messages = await qb.getMany();
    const hasMore = messages.length > limit;

    if (hasMore) messages.pop();

    return { messages, hasMore };
  }

  /** Сообщения новее ключа; порядок — от новых к старым, как у `findOlder`. */
  async findNewer(
    chatId: string,
    userId: string,
    after: IMessageKey,
    limit: number,
  ) {
    const messages = await this._baseMessageQuery("message", userId)
      .andWhere("message.chatId = :chatId", { chatId })
      .andWhere("(message.createdAt, message.id) > (:keyAt, :keyId)", {
        keyAt: after.createdAt,
        keyId: after.id,
      })
      .orderBy("message.createdAt", "ASC")
      .addOrderBy("message.id", "ASC")
      .take(limit + 1)
      .getMany();
    const hasMore = messages.length > limit;

    if (hasMore) messages.pop();

    return { messages: messages.reverse(), hasMore };
  }

  /**
   * Окно вокруг сообщения: половина старше, половина новее и само сообщение,
   * от новых к старым. `null` — сообщения нет в чате.
   */
  async findAround(
    chatId: string,
    userId: string,
    messageId: string,
    limit: number,
  ) {
    const anchor = await this.findOne({
      where: { id: messageId, chatId },
      select: { id: true, createdAt: true },
    });

    if (!anchor) return null;

    const half = Math.max(1, Math.floor(limit / 2));
    const [anchorFull, older, newer] = await Promise.all([
      this.findById(messageId),
      this.findOlder(chatId, userId, anchor, half),
      this.findNewer(chatId, userId, anchor, half),
    ]);

    return {
      messages: [
        ...newer.messages,
        ...(anchorFull ? [anchorFull] : []),
        ...older.messages,
      ],
      hasOlder: older.hasMore,
      hasNewer: newer.hasMore,
    };
  }

  async searchInChat(
    chatId: string,
    userId: string,
    query: string,
    offset: number,
    limit: number,
  ) {
    return this._baseMessageQuery("message", userId)
      .andWhere("message.chatId = :chatId", { chatId })
      .andWhere("message.content ILIKE :query ESCAPE '\\'", {
        query: `%${escapeLikePattern(query)}%`,
      })
      .orderBy("message.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }

  async searchGlobal(
    chatIds: string[],
    userId: string,
    query: string,
    offset: number,
    limit: number,
  ) {
    if (chatIds.length === 0) return [[] as Message[], 0] as const;

    return this._baseMessageQuery("message", userId)
      .andWhere("message.chatId IN (:...chatIds)", { chatIds })
      .andWhere("message.content ILIKE :query ESCAPE '\\'", {
        query: `%${escapeLikePattern(query)}%`,
      })
      .orderBy("message.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }

  async findMediaByChatId(
    chatId: string,
    userId: string,
    type: string | undefined,
    offset: number,
    limit: number,
  ) {
    const qb = this.createQueryBuilder("message")
      .leftJoinAndSelect("message.sender", "sender")
      .leftJoinAndSelect("sender.profile", "senderProfile")
      .leftJoinAndSelect("senderProfile.avatar", "senderAvatar")
      .leftJoinAndSelect("message.attachments", "attachments")
      .leftJoinAndSelect("attachments.file", "file")
      .leftJoin(
        "message_deletions",
        "md",
        "md.message_id = message.id AND md.user_id = :mdUserId",
        { mdUserId: userId },
      )
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.isDeleted = false")
      .andWhere("md.id IS NULL")
      .andWhere("attachments.id IS NOT NULL");

    if (type === "document") {
      qb.andWhere(
        "file.type NOT LIKE 'image%' AND file.type NOT LIKE 'video%' AND file.type NOT LIKE 'audio%'",
      );
    } else if (type) {
      qb.andWhere("file.type LIKE :type", { type: `${type}%` });
    }

    return qb
      .orderBy("message.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }

  async getMediaStats(chatId: string, userId: string) {
    const result = await this.createQueryBuilder("message")
      .innerJoin("message.attachments", "attachments")
      .innerJoin("attachments.file", "file")
      .leftJoin(
        "message_deletions",
        "md",
        "md.message_id = message.id AND md.user_id = :mdUserId",
        { mdUserId: userId },
      )
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.isDeleted = false")
      .andWhere("md.id IS NULL")
      .select([
        "SUM(CASE WHEN file.type LIKE 'image%' THEN 1 ELSE 0 END) as images",
        "SUM(CASE WHEN file.type LIKE 'video%' THEN 1 ELSE 0 END) as videos",
        "SUM(CASE WHEN file.type LIKE 'audio%' THEN 1 ELSE 0 END) as audio",
        "SUM(CASE WHEN file.type NOT LIKE 'image%' AND file.type NOT LIKE 'video%' AND file.type NOT LIKE 'audio%' THEN 1 ELSE 0 END) as documents",
        "COUNT(*) as total",
      ])
      .getRawOne();

    return {
      images: parseInt(result?.images ?? "0", 10),
      videos: parseInt(result?.videos ?? "0", 10),
      audio: parseInt(result?.audio ?? "0", 10),
      documents: parseInt(result?.documents ?? "0", 10),
      total: parseInt(result?.total ?? "0", 10),
    };
  }

  async findPinnedByChatId(
    chatId: string,
    userId: string,
    offset: number,
    limit: number,
  ) {
    return this._baseMessageQuery("message", userId)
      .andWhere("message.chatId = :chatId", { chatId })
      .andWhere("message.isPinned = true")
      .orderBy("message.pinnedAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }

  /** Последнее сообщение пользователя в чате — для slow mode. */
  async findLastBySender(chatId: string, senderId: string) {
    return this.findOne({
      where: { chatId, senderId },
      order: { createdAt: "DESC" },
      select: { id: true, createdAt: true },
    });
  }

  /** Пометить удалённым для всех; `false`, если уже удалено (в т. ч. параллельно). */
  async markDeleted(id: string): Promise<boolean> {
    const result = await this.createQueryBuilder()
      .update()
      .set({ isDeleted: true })
      .where("id = :id", { id })
      .andWhere("is_deleted = false")
      .execute();

    return (result.affected ?? 0) > 0;
  }

  async findLastForChat(chatId: string) {
    return this.findOne({
      where: { chatId },
      order: { createdAt: "DESC" },
      relations: { sender: { profile: true } },
    });
  }

  /** Shared query builder with all message relations and deletion filtering. */
  private _baseMessageQuery(
    alias: string,
    userId?: string,
  ): SelectQueryBuilder<Message> {
    const qb = this.createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.sender`, "sender")
      .leftJoinAndSelect("sender.profile", "senderProfile")
      .leftJoinAndSelect("senderProfile.avatar", "senderAvatar")
      .leftJoinAndSelect(`${alias}.replyTo`, "replyTo")
      .leftJoinAndSelect("replyTo.sender", "replyToSender")
      .leftJoinAndSelect("replyToSender.profile", "replyToSenderProfile")
      .leftJoinAndSelect("replyToSenderProfile.avatar", "replyToSenderAvatar")
      .leftJoinAndSelect(`${alias}.attachments`, "attachments")
      .leftJoinAndSelect("attachments.file", "file")
      .leftJoinAndSelect(`${alias}.reactions`, "reactions")
      .leftJoinAndSelect(`${alias}.mentions`, "mentions")
      .where(`${alias}.isDeleted = false`);

    if (userId) {
      qb.leftJoin(
        "message_deletions",
        "md",
        `md.message_id = ${alias}.id AND md.user_id = :mdUserId`,
        { mdUserId: userId },
      ).andWhere("md.id IS NULL");
    }

    return qb;
  }
}
