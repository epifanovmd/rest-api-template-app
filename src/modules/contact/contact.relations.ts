import { inject } from "inversify";
import { In } from "typeorm";

import { Injectable } from "../../core";
import { EPrivacyLevel, IContactRelation, IPresenceAudience } from "../profile";
import { ContactRepository } from "./contact.repository";
import { EContactStatus } from "./contact.types";

/** Уровень приватности `contacts`: поле видно тем, кого пользователь принял в контакты. */
@Injectable()
export class ContactRelation implements IContactRelation {
  constructor(
    @inject(ContactRepository) private readonly _repo: ContactRepository,
  ) {}

  async contactsOf(viewerId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    const contacts = await this._repo.find({
      where: {
        userId: In(userIds),
        contactUserId: viewerId,
        status: EContactStatus.ACCEPTED,
      },
    });

    return contacts.map(contact => contact.userId);
  }
}

/**
 * Присутствие для контактов: при `contacts` — тем, кого пользователь принял,
 * при `everyone` — ещё и тем, у кого он сам в контактах.
 */
@Injectable()
export class ContactPresenceAudience implements IPresenceAudience {
  constructor(
    @inject(ContactRepository) private readonly _repo: ContactRepository,
  ) {}

  async audience(userId: string, level: EPrivacyLevel): Promise<string[]> {
    if (level === EPrivacyLevel.NOBODY) return [];

    const own = await this._repo.find({
      where: { userId, status: EContactStatus.ACCEPTED },
    });
    const ids = own.map(contact => contact.contactUserId);

    if (level === EPrivacyLevel.EVERYONE) {
      const reverse = await this._repo.find({
        where: { contactUserId: userId, status: EContactStatus.ACCEPTED },
      });

      ids.push(...reverse.map(contact => contact.userId));
    }

    return ids;
  }

  async peers(): Promise<string[]> {
    return [];
  }
}
