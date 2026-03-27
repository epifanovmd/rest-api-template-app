import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Chat } from "./chat.entity";
import { EChatType } from "./chat.types";

@InjectableRepository(Chat)
export class ChatRepository extends BaseRepository<Chat> {
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        members: { user: { profile: true } },
        avatar: true,
        lastMessageSender: { profile: true },
      },
    });
  }

  async findDirectChat(userId1: string, userId2: string) {
    return this.createQueryBuilder("chat")
      .innerJoin("chat.members", "m1", "m1.userId = :userId1", { userId1 })
      .innerJoin("chat.members", "m2", "m2.userId = :userId2", { userId2 })
      .where("chat.type = :type", { type: EChatType.DIRECT })
      .getOne();
  }

  async findUserChats(userId: string, offset?: number, limit?: number) {
    const qb = this.createQueryBuilder("chat")
      .innerJoin("chat.members", "membership", "membership.userId = :userId", {
        userId,
      })
      .leftJoinAndSelect("chat.members", "members")
      .leftJoinAndSelect("members.user", "user")
      .leftJoinAndSelect("user.profile", "profile")
      .leftJoinAndSelect("chat.avatar", "avatar")
      .leftJoinAndSelect("chat.lastMessageSender", "lastMsgSender")
      .leftJoinAndSelect("lastMsgSender.profile", "lastMsgSenderProfile")
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
        "(chat.name ILIKE :q OR chat.username ILIKE :q)",
        { q: `%${query}%` },
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
        members: { user: { profile: true } },
        avatar: true,
        lastMessageSender: { profile: true },
      },
    });
  }
}
