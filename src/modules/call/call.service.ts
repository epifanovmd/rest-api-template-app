import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { inject } from "inversify";
import { DataSource } from "typeorm";

import { EventBus, Injectable } from "../../core";
import { Call } from "./call.entity";
import { CallRepository } from "./call.repository";
import { ECallStatus, ECallType } from "./call.types";
import { CallDto } from "./dto";
import {
  CallAnsweredEvent,
  CallDeclinedEvent,
  CallEndedEvent,
  CallInitiatedEvent,
  CallMissedEvent,
} from "./events";

@Injectable()
export class CallService {
  constructor(
    @inject(CallRepository) private _callRepo: CallRepository,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(DataSource) private _dataSource: DataSource,
  ) {}

  async initiateCall(
    callerId: string,
    data: { calleeId: string; chatId?: string; type?: ECallType },
  ) {
    if (callerId === data.calleeId) {
      throw new BadRequestException("Нельзя позвонить самому себе");
    }

    // Check + create in a transaction with row-level locking
    const savedId = await this._dataSource.transaction(async manager => {
      const callRepo = manager.getRepository(Call);
      const activeStatuses = [ECallStatus.RINGING, ECallStatus.ACTIVE];

      // Lock rows for caller's active calls using SELECT ... FOR UPDATE
      const callerActiveCalls = await callRepo
        .createQueryBuilder("call")
        .setLock("pessimistic_write")
        .where(
          "(call.callerId = :callerId OR call.calleeId = :callerId)",
          { callerId },
        )
        .andWhere("call.status IN (:...statuses)", {
          statuses: activeStatuses,
        })
        .getMany();

      if (callerActiveCalls.length > 0) {
        throw new BadRequestException("У вас уже есть активный звонок");
      }

      // Lock rows for callee's active calls
      const calleeActiveCalls = await callRepo
        .createQueryBuilder("call")
        .setLock("pessimistic_write")
        .where(
          "(call.callerId = :calleeId OR call.calleeId = :calleeId)",
          { calleeId: data.calleeId },
        )
        .andWhere("call.status IN (:...statuses)", {
          statuses: activeStatuses,
        })
        .getMany();

      if (calleeActiveCalls.length > 0) {
        throw new BadRequestException("Пользователь уже в звонке");
      }

      const call = callRepo.create({
        callerId,
        calleeId: data.calleeId,
        chatId: data.chatId ?? null,
        type: data.type ?? ECallType.VOICE,
        status: ECallStatus.RINGING,
      });

      const saved = await callRepo.save(call);

      return saved.id;
    });

    const fullCall = await this._callRepo.findById(savedId);

    this._eventBus.emit(new CallInitiatedEvent(fullCall!));

    return CallDto.fromEntity(fullCall!);
  }

  async answerCall(callId: string, userId: string) {
    const call = await this._callRepo.findById(callId);

    if (!call) {
      throw new NotFoundException("Звонок не найден");
    }

    if (call.calleeId !== userId) {
      throw new ForbiddenException("Вы не можете ответить на этот звонок");
    }

    if (call.status !== ECallStatus.RINGING) {
      throw new BadRequestException("Звонок не в состоянии ожидания");
    }

    call.status = ECallStatus.ACTIVE;
    call.startedAt = new Date();
    await this._callRepo.save(call);

    const updatedCall = await this._callRepo.findById(callId);

    this._eventBus.emit(new CallAnsweredEvent(updatedCall!));

    return CallDto.fromEntity(updatedCall!);
  }

  async declineCall(callId: string, userId: string) {
    const call = await this._callRepo.findById(callId);

    if (!call) {
      throw new NotFoundException("Звонок не найден");
    }

    if (call.calleeId !== userId && call.callerId !== userId) {
      throw new ForbiddenException("Вы не участник этого звонка");
    }

    if (call.status !== ECallStatus.RINGING) {
      throw new BadRequestException("Звонок не в состоянии ожидания");
    }

    call.status =
      call.calleeId === userId ? ECallStatus.DECLINED : ECallStatus.MISSED;
    call.endedAt = new Date();
    await this._callRepo.save(call);

    const updatedCall = await this._callRepo.findById(callId);

    if (call.status === ECallStatus.DECLINED) {
      this._eventBus.emit(new CallDeclinedEvent(updatedCall!));
    } else {
      this._eventBus.emit(new CallMissedEvent(updatedCall!));
    }

    return CallDto.fromEntity(updatedCall!);
  }

  async endCall(callId: string, userId: string) {
    const call = await this._callRepo.findById(callId);

    if (!call) {
      throw new NotFoundException("Звонок не найден");
    }

    if (call.callerId !== userId && call.calleeId !== userId) {
      throw new ForbiddenException("Вы не участник этого звонка");
    }

    if (
      call.status !== ECallStatus.ACTIVE &&
      call.status !== ECallStatus.RINGING
    ) {
      throw new BadRequestException("Звонок уже завершён");
    }

    const now = new Date();

    call.status = ECallStatus.ENDED;
    call.endedAt = now;

    if (call.startedAt) {
      call.duration = Math.floor(
        (now.getTime() - call.startedAt.getTime()) / 1000,
      );
    }

    await this._callRepo.save(call);

    const updatedCall = await this._callRepo.findById(callId);

    this._eventBus.emit(new CallEndedEvent(updatedCall!));

    return CallDto.fromEntity(updatedCall!);
  }

  async getCallHistory(userId: string, limit?: number, offset?: number) {
    const [calls, totalCount] = await this._callRepo.findCallHistory(
      userId,
      limit ?? 50,
      offset ?? 0,
    );

    return {
      data: calls.map(CallDto.fromEntity),
      totalCount,
    };
  }

  async getActiveCall(userId: string) {
    const activeCalls = await this._callRepo.findActiveCalls(userId);

    if (activeCalls.length === 0) {
      return null;
    }

    return CallDto.fromEntity(activeCalls[0]);
  }
}
