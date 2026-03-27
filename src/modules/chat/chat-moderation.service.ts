import { ForbiddenException, NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { ChatRepository } from "./chat.repository";
import { EChatMemberRole } from "./chat.types";
import { ChatMemberRepository } from "./chat-member.repository";
import {
  ChatMemberBannedEvent,
  ChatMemberUnbannedEvent,
  ChatSlowModeEvent,
} from "./events/moderation.event";

@Injectable()
export class ChatModerationService {
  constructor(
    @inject(ChatRepository) private _chatRepo: ChatRepository,
    @inject(ChatMemberRepository) private _memberRepo: ChatMemberRepository,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async setSlowMode(chatId: string, userId: string, seconds: number) {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    if (
      membership.role !== EChatMemberRole.ADMIN &&
      membership.role !== EChatMemberRole.OWNER
    ) {
      throw new ForbiddenException(
        "Только администратор может изменять режим медленной отправки",
      );
    }

    await this._chatRepo.update({ id: chatId }, { slowModeSeconds: seconds });

    this._eventBus.emit(new ChatSlowModeEvent(chatId, seconds, userId));

    return { chatId, slowModeSeconds: seconds };
  }

  async banMember(
    chatId: string,
    userId: string,
    targetUserId: string,
    duration?: number,
    reason?: string,
  ) {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    if (
      membership.role !== EChatMemberRole.ADMIN &&
      membership.role !== EChatMemberRole.OWNER
    ) {
      throw new ForbiddenException(
        "Только администратор может блокировать участников",
      );
    }

    if (userId === targetUserId) {
      throw new ForbiddenException("Нельзя заблокировать самого себя");
    }

    const targetMembership = await this._memberRepo.findMembership(
      chatId,
      targetUserId,
    );

    if (!targetMembership) {
      throw new NotFoundException("Участник не найден в этом чате");
    }

    if (
      targetMembership.role === EChatMemberRole.OWNER ||
      (targetMembership.role === EChatMemberRole.ADMIN &&
        membership.role !== EChatMemberRole.OWNER)
    ) {
      throw new ForbiddenException(
        "Недостаточно прав для блокировки этого участника",
      );
    }

    // Remove the member from the chat
    await this._memberRepo.delete({ id: targetMembership.id });

    this._eventBus.emit(
      new ChatMemberBannedEvent(chatId, targetUserId, userId, duration, reason),
    );
  }

  async unbanMember(
    chatId: string,
    userId: string,
    targetUserId: string,
  ) {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    if (
      membership.role !== EChatMemberRole.ADMIN &&
      membership.role !== EChatMemberRole.OWNER
    ) {
      throw new ForbiddenException(
        "Только администратор может разблокировать участников",
      );
    }

    // Re-add the member to the chat (banning removes the membership)
    await this._memberRepo.save(
      this._memberRepo.create({
        chatId,
        userId: targetUserId,
        role: EChatMemberRole.MEMBER,
      }),
    );

    this._eventBus.emit(
      new ChatMemberUnbannedEvent(chatId, targetUserId, userId),
    );
  }

  async getBannedMembers(chatId: string, userId: string) {
    const membership = await this._memberRepo.findMembership(chatId, userId);

    if (!membership) {
      throw new ForbiddenException("Вы не являетесь участником этого чата");
    }

    if (
      membership.role !== EChatMemberRole.ADMIN &&
      membership.role !== EChatMemberRole.OWNER
    ) {
      throw new ForbiddenException(
        "Только администратор может просматривать заблокированных",
      );
    }

    // Return empty list — actual ban tracking would be handled by the other agent's Feature 2
    return [];
  }
}
