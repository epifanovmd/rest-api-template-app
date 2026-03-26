import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { MessageReaction } from "./message-reaction.entity";

@InjectableRepository(MessageReaction)
export class MessageReactionRepository extends BaseRepository<MessageReaction> {
  async findByMessageId(messageId: string) {
    return this.find({
      where: { messageId },
      relations: { user: { profile: true } },
      order: { createdAt: "ASC" },
    });
  }

  async findByUserAndMessage(userId: string, messageId: string) {
    return this.findOne({
      where: { userId, messageId },
    });
  }

  async getReactionsSummary(messageId: string) {
    const reactions = await this.find({
      where: { messageId },
      select: ["emoji", "userId"],
    });

    const map = new Map<string, string[]>();

    for (const r of reactions) {
      const list = map.get(r.emoji) ?? [];

      list.push(r.userId);
      map.set(r.emoji, list);
    }

    return Array.from(map.entries()).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      userIds,
    }));
  }
}
