import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { MemberAddedEvent, MemberRemovedEvent } from "../dialog/events";
import { DialogMembersRepository } from "./dialog-members.repository";

@Injectable()
export class DialogMembersService {
  constructor(
    @inject(EventBus) private readonly eventBus: EventBus,
    @inject(DialogMembersRepository)
    private _dialogMembersRepository: DialogMembersRepository,
  ) {}

  async getMembers(dialogId: string) {
    return await this._dialogMembersRepository.findByDialogId(dialogId);
  }

  async addMembers({
    userId,
    dialogId,
    members,
  }: {
    userId?: string;
    dialogId: string;
    members: string[];
  }) {
    if (userId) {
      const member =
        await this._dialogMembersRepository.findByUserIdAndDialogId(
          userId,
          dialogId,
        );

      if (!member) {
        throw new NotFoundException("Диалог не найден");
      }
    }

    const createdMembers = await Promise.all(
      members.map(async memberUserId => {
        try {
          return await this._dialogMembersRepository.createAndSave({
            userId: memberUserId,
            dialogId,
          });
        } catch {
          // Игнорируем дубликаты
          return null;
        }
      }),
    );

    const addedIds = createdMembers
      .filter(member => member !== null)
      .map(member => member.userId);

    // Уведомляем только когда участники добавляются в существующий диалог
    if (userId && addedIds.length > 0) {
      this.eventBus.emit(new MemberAddedEvent(dialogId, addedIds));
    }

    return this.getMembers(dialogId);
  }

  async deleteMember(id: string) {
    const member = await this._dialogMembersRepository.findById(id);

    if (!member) {
      throw new NotFoundException("Участник не найден");
    }

    const deleted = await this._dialogMembersRepository.delete(id);

    if (deleted.affected) {
      this.eventBus.emit(new MemberRemovedEvent(member.dialogId, member.userId));
    }

    return !!deleted.affected;
  }
}
