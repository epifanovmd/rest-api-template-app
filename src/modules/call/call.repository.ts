import { In, QueryDeepPartialEntity } from "typeorm";

import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { Call } from "./call.entity";
import { ECallStatus } from "./call.types";

@InjectableRepository(Call)
export class CallRepository extends BaseRepository<Call> {
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        caller: { profile: { avatar: true } },
        callee: { profile: { avatar: true } },
      },
    });
  }

  async findActiveCalls(userId: string) {
    return this.find({
      where: [
        {
          callerId: userId,
          status: In([ECallStatus.RINGING, ECallStatus.ACTIVE]),
        },
        {
          calleeId: userId,
          status: In([ECallStatus.RINGING, ECallStatus.ACTIVE]),
        },
      ],
      relations: {
        caller: { profile: { avatar: true } },
        callee: { profile: { avatar: true } },
      },
      order: { createdAt: "DESC" },
    });
  }

  async findCallHistory(userId: string, offset: number, limit: number) {
    return this.createQueryBuilder("call")
      .leftJoinAndSelect("call.caller", "caller")
      .leftJoinAndSelect("caller.profile", "callerProfile")
      .leftJoinAndSelect("callerProfile.avatar", "callerAvatar")
      .leftJoinAndSelect("call.callee", "callee")
      .leftJoinAndSelect("callee.profile", "calleeProfile")
      .leftJoinAndSelect("calleeProfile.avatar", "calleeAvatar")
      .where("call.callerId = :userId OR call.calleeId = :userId", { userId })
      .orderBy("call.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }

  /**
   * Атомарный переход статуса: обновляет звонок, только если его текущий
   * статус входит в `from`. false — звонок уже перешёл в другой статус.
   */
  async transitionStatus(
    id: string,
    from: ECallStatus[],
    patch: QueryDeepPartialEntity<Call>,
  ): Promise<boolean> {
    const result = await this.createQueryBuilder()
      .update(Call)
      .set(patch)
      .where("id = :id", { id })
      .andWhere("status IN (:...from)", { from })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  /**
   * Переводит просроченные RINGING-звонки (или один `callId`) в MISSED.
   * Условие по статусу в самом UPDATE: каждую строку переводит ровно один
   * процесс, повтор ничего не меняет.
   */
  async expireRinging(now: Date, callId?: string): Promise<string[]> {
    const qb = this.createQueryBuilder()
      .update(Call)
      .set({ status: ECallStatus.MISSED, endedAt: now })
      .where("status = :status", { status: ECallStatus.RINGING })
      .andWhere("ringingTimeoutAt <= :now", { now });

    if (callId) qb.andWhere("id = :callId", { callId });

    const result = await qb.returning(["id"]).execute();

    return ((result.raw ?? []) as Array<{ id: string }>).map(r => r.id);
  }
}
