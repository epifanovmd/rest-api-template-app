import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { ChatFolder } from "./chat-folder.entity";

@InjectableRepository(ChatFolder)
export class ChatFolderRepository extends BaseRepository<ChatFolder> {
  async findByUser(userId: string) {
    return this.find({
      where: { userId },
      order: { position: "ASC", createdAt: "ASC" },
    });
  }
}
