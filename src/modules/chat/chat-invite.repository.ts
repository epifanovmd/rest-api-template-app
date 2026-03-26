import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { ChatInvite } from "./chat-invite.entity";

@InjectableRepository(ChatInvite)
export class ChatInviteRepository extends BaseRepository<ChatInvite> {
  async findByCode(code: string) {
    return this.findOne({
      where: { code },
      relations: { chat: true },
    });
  }

  async findByChatId(chatId: string) {
    return this.find({
      where: { chatId, isActive: true },
      order: { createdAt: "DESC" },
    });
  }
}
