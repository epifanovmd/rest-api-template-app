import { inject } from "inversify";

import { Injectable } from "../../core";
import { EPrivacyLevel, IPresenceAudience } from "../profile";
import { ChatMemberRepository } from "./chat-member.repository";

/** Собеседники личных чатов видят присутствие друг друга (кроме `nobody`). */
@Injectable()
export class ChatPresenceAudience implements IPresenceAudience {
  constructor(
    @inject(ChatMemberRepository)
    private readonly _members: ChatMemberRepository,
  ) {}

  async audience(userId: string, level: EPrivacyLevel): Promise<string[]> {
    if (level === EPrivacyLevel.NOBODY) return [];

    return this._members.findDirectChatPartnerIds(userId);
  }

  async peers(userId: string): Promise<string[]> {
    return this._members.findDirectChatPartnerIds(userId);
  }
}
