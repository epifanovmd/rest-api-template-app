import { inject } from "inversify";
import { In } from "typeorm";

import { Injectable } from "../../core";
import type { IFileUsageProbe } from "../file";
import { BotRepository } from "./bot.repository";

/** Файл — аватар бота. */
@Injectable()
export class BotAvatarUsageProbe implements IFileUsageProbe {
  constructor(@inject(BotRepository) private readonly _bots: BotRepository) {}

  async filesInUse(fileIds: string[]): Promise<string[]> {
    const bots = await this._bots.find({
      select: { avatarId: true },
      where: { avatarId: In(fileIds) },
    });

    return bots.flatMap(bot => (bot.avatarId ? [bot.avatarId] : []));
  }
}
