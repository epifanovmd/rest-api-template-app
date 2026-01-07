import { FindOptionsRelations } from "typeorm";

import { BaseRepository, InjectableRepository } from "../../core";
import { Dialog } from "./dialog.entity";

@InjectableRepository(Dialog)
export class DialogRepository extends BaseRepository<Dialog> {
  async findById(
    id: string,
    relations?: FindOptionsRelations<Dialog>,
  ): Promise<Dialog | null> {
    return this.findOne({
      where: { id },
      relations,
    });
  }

  async findByOwnerId(ownerId: string): Promise<Dialog[]> {
    return this.find({
      where: { ownerId },
      relations: {
        owner: true,
        members: true,
        messages: true,
      },
    });
  }

  async findPrivateDialogBetweenUsers(
    user1Id: string,
    user2Id: string,
  ): Promise<string | null> {
    const result = await this.createQueryBuilder("dialog")
      .select("dialog.id", "id")
      .innerJoin("dialog.members", "member")
      .where("member.userId IN (:...userIds)", { userIds: [user1Id, user2Id] })
      .groupBy("dialog.id")
      .having("COUNT(DISTINCT member.userId) = 2") // Оба пользователя в диалоге
      .andHaving("COUNT(*) = 2") // И нет других участников
      .getRawOne<{ id: string }>();

    return result?.id || null;
  }

  async findDialogWithExactMembers(userIds: string[]): Promise<string | null> {
    const uniqueUserIds = Array.from(new Set(userIds));

    if (uniqueUserIds.length === 0) {
      return null;
    }

    // Находим все диалоги, где есть указанные пользователи
    const dialogsWithUsers = await this.createQueryBuilder("dialog")
      .select("dialog.id", "id")
      .addSelect(
        "(SELECT COUNT(*) FROM dialog_members WHERE dialog_id = dialog.id)",
        "totalMembers",
      )
      .innerJoin("dialog.members", "member")
      .where("member.userId IN (:...userIds)", { userIds: uniqueUserIds })
      .groupBy("dialog.id")
      .having("COUNT(DISTINCT member.userId) = :exactCount", {
        exactCount: uniqueUserIds.length,
      })
      .getRawMany<{ id: string; totalMembers: string }>();

    // Фильтруем те, где общее количество участников равно exactCount
    const exactDialog = dialogsWithUsers.find(
      dialog => parseInt(dialog.totalMembers) === uniqueUserIds.length,
    );

    return exactDialog?.id || null;
  }
}
