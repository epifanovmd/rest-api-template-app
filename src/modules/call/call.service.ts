import { inject } from "inversify";
import { DataSource, In } from "typeorm";

import {
  EventBus,
  Injectable,
  IPaginatedDto,
  JobQueue,
  normalizePagination,
  toPage,
} from "../../core";
import { ChatRepository } from "../chat";
import { UserBlockService } from "../contact";
import { FileUrlService } from "../file";
import { UserRepository } from "../user";
import { Call } from "./call.entity";
import { CallError } from "./call.errors";
import { CallRepository } from "./call.repository";
import { ECallStatus, ECallType } from "./call.types";
import { CallDto, collectCallFiles } from "./dto";
import {
  CallAnsweredEvent,
  CallDeclinedEvent,
  CallEndedEvent,
  CallInitiatedEvent,
  CallMissedEvent,
} from "./events";

/** Сколько звонок может быть в RINGING, прежде чем станет MISSED. */
export const CALL_RINGING_TIMEOUT_MS = 60_000;

/** Очередь отложенного таймаута звонка (обработчик — `call-ringing.job.ts`). */
export const CALL_RINGING_TIMEOUT_QUEUE = "call.ringing-timeout";

/** Пространство ключей advisory-lock звонков (первый аргумент pg_advisory_xact_lock). */
const CALL_LOCK_NAMESPACE = 0x43414c4c; // "CALL"

const ACTIVE_STATUSES = [ECallStatus.RINGING, ECallStatus.ACTIVE];

@Injectable()
export class CallService {
  constructor(
    @inject(CallRepository) private _callRepo: CallRepository,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(DataSource) private _dataSource: DataSource,
    @inject(UserRepository) private _userRepo: UserRepository,
    @inject(UserBlockService) private _userBlock: UserBlockService,
    @inject(ChatRepository) private _chatRepo: ChatRepository,
    @inject(JobQueue) private _jobs: JobQueue,
    @inject(FileUrlService) private _fileUrls: FileUrlService,
  ) {}

  /**
   * Начать звонок. `chatId` не принимается от клиента: звонок привязывается
   * к существующему direct-чату пары (или остаётся без чата). Таймаут
   * RINGING ставится отложенной задачей в той же транзакции.
   */
  async initiateCall(
    callerId: string,
    data: { calleeId: string; type?: ECallType },
  ) {
    const { calleeId } = data;

    if (callerId === calleeId) {
      throw CallError.SELF_CALL();
    }

    const callee = await this._userRepo.findById(calleeId);

    if (!callee) {
      throw CallError.USER_NOT_FOUND();
    }

    if (await this._userBlock.isBlockedEither(callerId, calleeId)) {
      throw CallError.USER_BLOCKED();
    }

    const directChat = await this._chatRepo.findDirectChat(callerId, calleeId);

    const savedId = await this._dataSource.transaction(async manager => {
      // Блокировки на обоих участников в фиксированном порядке: параллельные
      // звонки с участием любого из них сериализуются, взаимных дедлоков нет.
      for (const userId of [callerId, calleeId].sort()) {
        await manager.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [
          CALL_LOCK_NAMESPACE,
          userId,
        ]);
      }

      const callRepo = manager.getRepository(Call);
      const pair = [callerId, calleeId];
      const active = await callRepo.find({
        where: [
          { callerId: In(pair), status: In(ACTIVE_STATUSES) },
          { calleeId: In(pair), status: In(ACTIVE_STATUSES) },
        ],
      });

      if (active.length > 0) {
        const callerBusy = active.some(
          c => c.callerId === callerId || c.calleeId === callerId,
        );

        throw callerBusy ? CallError.ALREADY_IN_CALL() : CallError.BUSY();
      }

      const ringingTimeoutAt = new Date(Date.now() + CALL_RINGING_TIMEOUT_MS);
      const call = callRepo.create({
        callerId,
        calleeId,
        chatId: directChat?.id ?? null,
        type: data.type ?? ECallType.VOICE,
        status: ECallStatus.RINGING,
        ringingTimeoutAt,
      });

      const saved = await callRepo.save(call);

      await this._jobs.enqueue(
        CALL_RINGING_TIMEOUT_QUEUE,
        { callId: saved.id },
        {
          startAfter: ringingTimeoutAt,
          singletonKey: `call:${saved.id}`,
          manager,
        },
      );

      return saved.id;
    });

    const fullCall = await this._getOrThrow(savedId);

    this._eventBus.emit(new CallInitiatedEvent(fullCall));

    return this._toDto(fullCall);
  }

  async answerCall(callId: string, userId: string) {
    const call = await this._getOrThrow(callId);

    if (call.calleeId !== userId) {
      throw CallError.NOT_CALLEE();
    }

    if (call.status !== ECallStatus.RINGING) {
      throw CallError.NOT_RINGING();
    }

    if (
      call.ringingTimeoutAt &&
      call.ringingTimeoutAt.getTime() <= Date.now()
    ) {
      throw CallError.RINGING_EXPIRED();
    }

    await this._transition(call, [ECallStatus.RINGING], {
      status: ECallStatus.ACTIVE,
      startedAt: new Date(),
    });

    const updated = await this._getOrThrow(callId);

    this._eventBus.emit(new CallAnsweredEvent(updated));

    return this._toDto(updated);
  }

  async declineCall(callId: string, userId: string) {
    const call = await this._getOrThrow(callId);

    this._assertParticipant(call, userId);

    if (call.status !== ECallStatus.RINGING) {
      throw CallError.NOT_RINGING();
    }

    return this._finishRinging(call, userId);
  }

  /**
   * Завершить звонок. Отвеченный → ENDED с длительностью; ещё звонящий —
   * как отмена (caller → MISSED) или отказ (callee → DECLINED).
   */
  async endCall(callId: string, userId: string) {
    const call = await this._getOrThrow(callId);

    this._assertParticipant(call, userId);

    if (call.status === ECallStatus.RINGING) {
      return this._finishRinging(call, userId);
    }

    if (call.status !== ECallStatus.ACTIVE) {
      throw CallError.ALREADY_ENDED();
    }

    const now = new Date();

    await this._transition(call, [ECallStatus.ACTIVE], {
      status: ECallStatus.ENDED,
      endedAt: now,
      duration: call.startedAt
        ? Math.floor((now.getTime() - call.startedAt.getTime()) / 1000)
        : null,
    });

    const updated = await this._getOrThrow(callId);

    this._eventBus.emit(new CallEndedEvent(updated));

    return this._toDto(updated);
  }

  /** Все просроченные RINGING-звонки → MISSED. Возвращает их число. */
  async expireRingingCalls(): Promise<number> {
    const ids = await this._callRepo.expireRinging(new Date());

    await this._emitMissed(ids);

    return ids.length;
  }

  /**
   * Один звонок → MISSED, если он ещё звонит и срок вышел. `false` —
   * звонок уже отвечен, отклонён или срок не наступил (тогда его заберёт
   * периодический проход).
   */
  async expireRingingCall(callId: string): Promise<boolean> {
    const ids = await this._callRepo.expireRinging(new Date(), callId);

    await this._emitMissed(ids);

    return ids.length > 0;
  }

  async getCallHistory(
    userId: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<CallDto>> {
    const page = normalizePagination(offset, limit);
    const [calls, total] = await this._callRepo.findCallHistory(
      userId,
      page.offset,
      page.limit,
    );

    return toPage(await this._toDtos(calls), total, page);
  }

  async getActiveCall(userId: string) {
    const activeCalls = await this._callRepo.findActiveCalls(userId);

    if (activeCalls.length === 0) {
      return null;
    }

    return this._toDto(activeCalls[0]);
  }

  private _toDtos(calls: Call[]) {
    return this._fileUrls.buildWithFiles(
      calls,
      collectCallFiles,
      CallDto.fromEntity,
    );
  }

  private _toDto(call: Call) {
    return this._fileUrls.buildOneWithFiles(
      call,
      collectCallFiles,
      CallDto.fromEntity,
    );
  }

  private async _emitMissed(ids: string[]) {
    for (const id of ids) {
      const call = await this._callRepo.findById(id);

      if (call) this._eventBus.emit(new CallMissedEvent(call));
    }
  }

  /** RINGING → MISSED (отменил caller) или DECLINED (отказался callee). */
  private async _finishRinging(call: Call, userId: string) {
    const status =
      call.calleeId === userId ? ECallStatus.DECLINED : ECallStatus.MISSED;

    await this._transition(call, [ECallStatus.RINGING], {
      status,
      endedAt: new Date(),
    });

    const updated = await this._getOrThrow(call.id);

    this._eventBus.emit(
      status === ECallStatus.DECLINED
        ? new CallDeclinedEvent(updated)
        : new CallMissedEvent(updated),
    );

    return this._toDto(updated);
  }

  private async _transition(
    call: Call,
    from: ECallStatus[],
    patch: Parameters<CallRepository["transitionStatus"]>[2],
  ) {
    const ok = await this._callRepo.transitionStatus(call.id, from, patch);

    if (!ok) {
      throw CallError.STATE_CHANGED();
    }
  }

  private async _getOrThrow(callId: string) {
    const call = await this._callRepo.findById(callId);

    if (!call) {
      throw CallError.NOT_FOUND();
    }

    return call;
  }

  private _assertParticipant(call: Call, userId: string) {
    if (call.callerId !== userId && call.calleeId !== userId) {
      throw CallError.NOT_PARTICIPANT();
    }
  }
}
