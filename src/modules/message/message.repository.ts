import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
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

  async findByChatCursor(
    chatId: string,
    before?: string,
    limit: number = 50,
  ) {
    const qb = this.createQueryBuilder("message")
      .leftJoinAndSelect("message.sender", "sender")
      .leftJoinAndSelect("sender.profile", "senderProfile")
      .leftJoinAndSelect("message.replyTo", "replyTo")
      .leftJoinAndSelect("replyTo.sender", "replyToSender")
      .leftJoinAndSelect("replyToSender.profile", "replyToSenderProfile")
      .leftJoinAndSelect("message.attachments", "attachments")
      .leftJoinAndSelect("attachments.file", "file")
      .leftJoinAndSelect("message.reactions", "reactions")
      .leftJoinAndSelect("message.mentions", "mentions")
      .where("message.chatId = :chatId", { chatId })
      .orderBy("message.createdAt", "DESC")
      .take(limit + 1); // +1 для определения hasMore

    if (before) {
      const cursorMessage = await this.findOne({
        where: { id: before },
        select: ["id", "createdAt"],
      });

      if (cursorMessage) {
        qb.andWhere("message.createdAt < :cursorDate", {
          cursorDate: cursorMessage.createdAt,
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

  async searchInChat(
    chatId: string,
    query: string,
    limit: number = 20,
    offset: number = 0,
  ) {
    return this.createQueryBuilder("message")
      .leftJoinAndSelect("message.sender", "sender")
      .leftJoinAndSelect("sender.profile", "senderProfile")
      .leftJoinAndSelect("message.attachments", "attachments")
      .leftJoinAndSelect("attachments.file", "file")
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

    return this.createQueryBuilder("message")
      .leftJoinAndSelect("message.sender", "sender")
      .leftJoinAndSelect("sender.profile", "senderProfile")
      .leftJoinAndSelect("message.attachments", "attachments")
      .leftJoinAndSelect("attachments.file", "file")
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

    if (type) {
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
}
