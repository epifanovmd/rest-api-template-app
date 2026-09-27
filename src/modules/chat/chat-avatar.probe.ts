import { inject } from "inversify";
import { In } from "typeorm";

import { Injectable } from "../../core";
import type { IFileUsageProbe } from "../file";
import { ChatRepository } from "./chat.repository";

/** Файл — аватар чата или канала. */
@Injectable()
export class ChatAvatarUsageProbe implements IFileUsageProbe {
  constructor(
    @inject(ChatRepository) private readonly _chats: ChatRepository,
  ) {}

  async filesInUse(fileIds: string[]): Promise<string[]> {
    const chats = await this._chats.find({
      select: { avatarId: true },
      where: { avatarId: In(fileIds) },
    });

    return chats.flatMap(chat => (chat.avatarId ? [chat.avatarId] : []));
  }
}
