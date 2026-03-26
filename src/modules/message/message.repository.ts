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
      .where("message.chatId = :chatId", { chatId })
      .orderBy("message.createdAt", "DESC")
      .take(limit + 1); // +1 для определения hasMore

    if (before) {
      const cursorMessage = await this.findOne({
        where: { id: before },
        select: ["createdAt"],
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

  async findLastForChat(chatId: string) {
    return this.findOne({
      where: { chatId },
      order: { createdAt: "DESC" },
      relations: { sender: { profile: true } },
    });
  }
}
