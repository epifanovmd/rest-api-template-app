import { SelectQueryBuilder } from "typeorm";

import { BaseRepository, InjectableRepository } from "../../core";
import { Message } from "./message.entity";

@InjectableRepository(Message)
export class MessageRepository extends BaseRepository<Message> {
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        sender: { profile: true },
        replyTo: { sender: { profile: true } },
        attachments: { file: true },
        reactions: true,
        mentions: true,
      },
    });
  }

  async findByChatCursor(chatId: string, before?: string, limit: number = 50) {
    const qb = this._baseMessageQuery("message")
      .where("message.chatId = :chatId", { chatId })
      .orderBy("message.createdAt", "DESC")
      .take(limit + 1);

    if (before) {
      const cursor = await this.findOne({
        where: { id: before },
        select: ["id", "createdAt"],
      });

      if (cursor) {
        qb.andWhere("message.createdAt < :cursorDate", {
          cursorDate: cursor.createdAt,
        });
      }
    }

    const messages = await qb.getMany();
    const hasMore = messages.length > limit;

    if (hasMore) {
      messages.pop();
    }

    return { messages, hasMore };
  }

  /**
   * Load messages NEWER than cursor (for scrolling down from a detached window).
   * Returns messages in DESC order (newest first) — consistent with findByChatCursor.
   */
  async findAfterCursor(chatId: string, after: string, limit: number = 50) {
    const cursor = await this.findOne({
      where: { id: after },
      select: ["id", "createdAt"],
    });

    const qb = this._baseMessageQuery("message")
      .where("message.chatId = :chatId", { chatId })
      .orderBy("message.createdAt", "ASC")
      .take(limit + 1);

    if (cursor) {
      qb.andWhere("message.createdAt > :cursorDate", {
        cursorDate: cursor.createdAt,
      });
    }

    const messages = await qb.getMany();
    const hasNewer = messages.length > limit;

    if (hasNewer) {
      messages.pop();
    }

    // Reverse to DESC (newest first) — consistent with other methods
    messages.reverse();

    return { messages, hasNewer };
  }

  /**
   * Load messages around a specific message (half before, half after).
   * Returns messages in DESC order (newest first) — same as findByChatCursor.
   */
  async findAroundMessage(
    chatId: string,
    messageId: string,
    limit: number = 50,
  ) {
    const anchor = await this.findOne({
      where: { id: messageId, chatId },
      select: ["id", "createdAt"],
    });

    if (!anchor) {
      return null;
    }

    const half = Math.floor(limit / 2);

    // Messages older than anchor (exclude anchor by id for same-timestamp safety)
    const olderQb = this._baseMessageQuery("message")
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.id != :anchorId", { anchorId: messageId })
      .andWhere("message.createdAt <= :anchorDate", {
        anchorDate: anchor.createdAt,
      })
      .orderBy("message.createdAt", "DESC")
      .take(half + 1);

    // Messages newer than anchor (exclude anchor by id for same-timestamp safety)
    const newerQb = this._baseMessageQuery("message")
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.id != :anchorId", { anchorId: messageId })
      .andWhere("message.createdAt >= :anchorDate", {
        anchorDate: anchor.createdAt,
      })
      .orderBy("message.createdAt", "ASC")
      .take(half + 1);

    const [anchorFull, olderMessages, newerMessages] = await Promise.all([
      this.findById(messageId),
      olderQb.getMany(),
      newerQb.getMany(),
    ]);

    const hasMore = olderMessages.length > half;
    const hasNewer = newerMessages.length > half;

    if (hasMore) olderMessages.pop();
    if (hasNewer) newerMessages.pop();

    // Return in DESC order (newest first) — consistent with findByChatCursor
    const messages = [
      ...newerMessages.reverse(), // newer were ASC → reverse to DESC
      ...(anchorFull ? [anchorFull] : []),
      ...olderMessages, // already DESC
    ];

    return { messages, hasMore, hasNewer };
  }

  async searchInChat(
    chatId: string,
    query: string,
    limit: number = 20,
    offset: number = 0,
  ) {
    return this._baseMessageQuery("message")
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.isDeleted = false")
      .andWhere("message.content ILIKE :query", { query: `%${query}%` })
      .orderBy("message.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }

  async searchGlobal(
    chatIds: string[],
    query: string,
    limit: number = 20,
    offset: number = 0,
  ) {
    if (chatIds.length === 0) return [[] as Message[], 0] as const;

    return this._baseMessageQuery("message")
      .where("message.chatId IN (:...chatIds)", { chatIds })
      .andWhere("message.isDeleted = false")
      .andWhere("message.content ILIKE :query", { query: `%${query}%` })
      .orderBy("message.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }

  async findMediaByChatId(
    chatId: string,
    type?: string,
    limit: number = 50,
    offset: number = 0,
  ) {
    const qb = this.createQueryBuilder("message")
      .leftJoinAndSelect("message.sender", "sender")
      .leftJoinAndSelect("sender.profile", "senderProfile")
      .leftJoinAndSelect("message.attachments", "attachments")
      .leftJoinAndSelect("attachments.file", "file")
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.isDeleted = false")
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

  async getMediaStats(chatId: string) {
    const result = await this.createQueryBuilder("message")
      .innerJoin("message.attachments", "attachments")
      .innerJoin("attachments.file", "file")
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.isDeleted = false")
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

  async findLastForChat(chatId: string) {
    return this.findOne({
      where: { chatId },
      order: { createdAt: "DESC" },
      relations: { sender: { profile: true } },
    });
  }

  /** Shared query builder with all message relations. */
  private _baseMessageQuery(alias: string): SelectQueryBuilder<Message> {
    return this.createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.sender`, "sender")
      .leftJoinAndSelect("sender.profile", "senderProfile")
      .leftJoinAndSelect(`${alias}.replyTo`, "replyTo")
      .leftJoinAndSelect("replyTo.sender", "replyToSender")
      .leftJoinAndSelect("replyToSender.profile", "replyToSenderProfile")
      .leftJoinAndSelect(`${alias}.attachments`, "attachments")
      .leftJoinAndSelect("attachments.file", "file")
      .leftJoinAndSelect(`${alias}.reactions`, "reactions")
      .leftJoinAndSelect(`${alias}.mentions`, "mentions");
  }
}
