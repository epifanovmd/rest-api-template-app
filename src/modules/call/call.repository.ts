import { In } from "typeorm";

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
        caller: { profile: true },
        callee: { profile: true },
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
        caller: { profile: true },
        callee: { profile: true },
      },
      order: { createdAt: "DESC" },
    });
  }

  async findCallHistory(userId: string, limit: number = 50, offset: number = 0) {
    return this.createQueryBuilder("call")
      .leftJoinAndSelect("call.caller", "caller")
      .leftJoinAndSelect("caller.profile", "callerProfile")
      .leftJoinAndSelect("call.callee", "callee")
      .leftJoinAndSelect("callee.profile", "calleeProfile")
      .where("call.callerId = :userId OR call.calleeId = :userId", { userId })
      .orderBy("call.createdAt", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();
  }
}
