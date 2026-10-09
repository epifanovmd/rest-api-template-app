import { In, IsNull, LessThan, Not } from "typeorm";

import type { ExternalJobAssignment } from "../../core";
import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { JobRun } from "./job-run.entity";
import {
  ACTIVE_JOB_RUN_STATUSES,
  EJobRunStatus,
  SETTLED_JOB_RUN_STATUSES,
} from "./jobs.types";

export interface IJobRunFilter {
  ownerId?: string;
  scope?: { type: string; id: string };
  statuses?: EJobRunStatus[];
  offset: number;
  limit: number;
}

/** Статусы, после которых запись не меняется воркером. */
const FINAL_STATUSES = [EJobRunStatus.COMPLETED, EJobRunStatus.CANCELLED];

@InjectableRepository(JobRun)
export class JobRunRepository extends BaseRepository<JobRun> {
  findById(id: string): Promise<JobRun | null> {
    return this.findOne({ where: { id } });
  }

  findPage({
    ownerId,
    scope,
    statuses,
    offset,
    limit,
  }: IJobRunFilter): Promise<[JobRun[], number]> {
    return this.findAndCount({
      where: {
        ...(ownerId !== undefined && { ownerId }),
        ...(scope !== undefined && {
          scopeType: scope.type,
          scopeId: scope.id,
        }),
        ...(statuses !== undefined &&
          statuses.length > 0 && { status: In(statuses) }),
      },
      order: { createdAt: "DESC" },
      skip: offset,
      take: limit,
    });
  }

  /**
   * Последняя задача каждого scope (`scopeType` + id из списка) среди
   * очередей `queues`: одна запись на scope, у которого задачи есть.
   */
  findLatestByScopes(
    scopeType: string,
    scopeIds: string[],
    queues: string[],
  ): Promise<JobRun[]> {
    if (scopeIds.length === 0 || queues.length === 0) {
      return Promise.resolve([]);
    }

    return this.createQueryBuilder("run")
      .distinctOn(["run.scopeId"])
      .where("run.scopeType = :scopeType", { scopeType })
      .andWhere("run.scopeId IN (:...scopeIds)", { scopeIds })
      .andWhere("run.queue IN (:...queues)", { queues })
      .orderBy("run.scopeId")
      .addOrderBy("run.createdAt", "DESC")
      .addOrderBy("run.id", "DESC")
      .getMany();
  }

  /** Взять задачу в работу, если она не завершена и не отменена. */
  async markRunning(
    id: string,
    patch: Pick<JobRun, "attempt" | "startedAt" | "leaseUntil">,
  ): Promise<boolean> {
    const { affected } = await this.update(
      { id, status: Not(In(FINAL_STATUSES)) },
      {
        ...patch,
        status: EJobRunStatus.RUNNING,
        finishedAt: null,
        error: null,
      },
    );

    return (affected ?? 0) > 0;
  }

  /** Внешняя задача по работе у воркера агента. */
  findByAssignment(
    agentId: string,
    externalId: string,
  ): Promise<JobRun | null> {
    return this.findOne({ where: { agentId, externalId } });
  }

  /**
   * Связать незавершённую запись с работой у воркера, если связи ещё нет.
   * `false` — работу уже связали (событие воркера пришло раньше ответа) или
   * задача завершена.
   */
  /** Тип задачи воркера и воркер внешней задачи (до передачи). */
  async setTarget(
    id: string,
    patch: Partial<Pick<JobRun, "jobType" | "worker">>,
  ): Promise<void> {
    await this.update({ id }, patch);
  }

  async attachExternal(
    id: string,
    assignment: ExternalJobAssignment,
    startedAt: Date,
    deadlineAt: Date,
  ): Promise<boolean> {
    const { affected } = await this.update(
      {
        id,
        externalId: IsNull(),
        status: In(ACTIVE_JOB_RUN_STATUSES as EJobRunStatus[]),
      },
      {
        agentId: assignment.agentId,
        worker: assignment.worker,
        externalId: assignment.workId,
        status: EJobRunStatus.RUNNING,
        startedAt,
        deadlineAt,
        error: null,
      },
    );

    return (affected ?? 0) > 0;
  }

  /**
   * Взять ждущую внешнюю задачу на передачу воркеру (`startedAt` — начало
   * передачи; статус остаётся «в очереди», пока воркер не принял задачу):
   * её не передаёт другой процесс или прежняя передача не закончилась к
   * `staleBefore` (процесс упал). `false` — задачу передают, она уже
   * передана или завершена.
   */
  async claimDispatch(
    id: string,
    attempt: number,
    now: Date,
    staleBefore: Date,
  ): Promise<boolean> {
    const result = await this.createQueryBuilder()
      .update(JobRun)
      .set({ attempt, startedAt: now })
      .where("id = :id AND external_id IS NULL AND status = :queued", {
        id,
        queued: EJobRunStatus.QUEUED,
      })
      .andWhere("(started_at IS NULL OR started_at < :staleBefore)", {
        staleBefore,
      })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  /** Вернуть задачу в ожидание: передача воркеру не удалась, будет повтор. */
  async releaseDispatch(
    id: string,
    patch: Pick<JobRun, "error" | "attempt">,
  ): Promise<boolean> {
    const { affected } = await this.update(
      { id, status: EJobRunStatus.QUEUED, externalId: IsNull() },
      { ...patch, startedAt: null },
    );

    return (affected ?? 0) > 0;
  }

  /** Ждущие внешние задачи очередей — передать, когда агент на связи. */
  async findQueuedExternalIds(
    queues: string[],
    limit: number,
  ): Promise<string[]> {
    if (!queues.length) return [];

    const rows = await this.find({
      select: { id: true },
      where: {
        queue: In(queues),
        status: EJobRunStatus.QUEUED,
        externalId: IsNull(),
      },
      order: { createdAt: "ASC" },
      take: limit,
    });

    return rows.map(row => row.id);
  }

  /** Незавершённые внешние задачи агента — сверка после его подключения. */
  findActiveExternalByAgent(agentId: string): Promise<JobRun[]> {
    return this.find({
      where: {
        agentId,
        externalId: Not(IsNull()),
        status: In(ACTIVE_JOB_RUN_STATUSES as EJobRunStatus[]),
      },
      order: { createdAt: "ASC" },
    });
  }

  /** Внешние задачи с истёкшим сроком. */
  findExpiredExternal(now: Date, limit: number): Promise<JobRun[]> {
    return this.find({
      where: {
        status: In(ACTIVE_JOB_RUN_STATUSES as EJobRunStatus[]),
        deadlineAt: LessThan(now),
      },
      order: { deadlineAt: "ASC" },
      take: limit,
    });
  }

  /** Продлить аренду выполняющейся задачи. */
  async extendLease(id: string, leaseUntil: Date): Promise<boolean> {
    const { affected } = await this.update(
      { id, status: EJobRunStatus.RUNNING },
      { leaseUntil },
    );

    return (affected ?? 0) > 0;
  }

  /** Удалить завершённые записи старше даты; вернуть сколько удалено. */
  async deleteSettledBefore(before: Date): Promise<number> {
    const { affected } = await this.delete({
      status: In(SETTLED_JOB_RUN_STATUSES as EJobRunStatus[]),
      finishedAt: LessThan(before),
    });

    return affected ?? 0;
  }

  /** Выполняющиеся задачи с истёкшей арендой: воркер пропал. */
  findExpiredLeases(now: Date, limit: number): Promise<JobRun[]> {
    return this.find({
      where: { status: EJobRunStatus.RUNNING, leaseUntil: LessThan(now) },
      order: { leaseUntil: "ASC" },
      take: limit,
    });
  }

  /** Из `ids` — те, которым запрошена отмена. */
  async findCancelRequestedIds(ids: string[]): Promise<string[]> {
    if (!ids.length) return [];

    const rows = await this.find({
      select: { id: true },
      where: { id: In(ids), cancelRequested: true },
    });

    return rows.map(row => row.id);
  }
}
