import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";

import { Injectable } from "../../core";
import { SocketService } from "../socket";
import { DialogMembersRepository } from "./dialog-members.repository";
import { DialogMembersDto } from "./dto";

@Injectable()
export class DialogMembersService {
  constructor(
    @inject(SocketService) private _socketService: SocketService,
    @inject(DialogMembersRepository)
    private _dialogMembersRepository: DialogMembersRepository,
  ) {}

  async getMembers(dialogId: string) {
    const members = await this._dialogMembersRepository.findByDialogId(
      dialogId,
    );

    return members.map(DialogMembersDto.fromEntity);
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
        } catch (error) {
          // Игнорируем дубликаты
          return null;
        }
      }),
    );

    createdMembers
      .filter(member => member !== null)
      .forEach(member => {
        const client = this._socketService.getClient(member!.userId);

        if (client) {
          client.emit("newDialog", dialogId);
        }
      });

    return this.getMembers(dialogId);
  }

  async deleteMember(id: string) {
    const member = await this._dialogMembersRepository.findById(id);

    if (!member) {
      throw new NotFoundException("Участник не найден");
    }

    const client = this._socketService.getClient(member.userId);

    if (client) {
      client.emit("deleteDialog", member.dialogId);
    }

    const deleted = await this._dialogMembersRepository.delete(id);

    return !!deleted.affected;
  }
}
