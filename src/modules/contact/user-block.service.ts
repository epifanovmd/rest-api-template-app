import { inject } from "inversify";

import { Injectable } from "../../core";
import { ContactRepository } from "./contact.repository";
import { EContactStatus } from "./contact.types";

/**
 * Блокировки между пользователями. Единая точка проверки для чатов,
 * сообщений, звонков и контактов: заблокировавший и заблокированный
 * не могут взаимодействовать ни в одну сторону.
 */
@Injectable()
export class UserBlockService {
  constructor(
    @inject(ContactRepository) private readonly _contactRepo: ContactRepository,
  ) {}

  /** Кто-то из двоих заблокировал другого. */
  async isBlockedEither(userId: string, otherUserId: string): Promise<boolean> {
    const count = await this._contactRepo.count({
      where: [
        {
          userId,
          contactUserId: otherUserId,
          status: EContactStatus.BLOCKED,
        },
        {
          userId: otherUserId,
          contactUserId: userId,
          status: EContactStatus.BLOCKED,
        },
      ],
    });

    return count > 0;
  }
}
