import { inject, optional } from "inversify";
import type { JobWithMetadata } from "pg-boss";
import { DataSource, In } from "typeorm";

import { config } from "../../config";
import {
  ExternalJobFiles,
  ExternalJobInfo,
  FileStorage,
  HttpException,
  IExternalJobHandler,
  Injectable,
  logger,
  requestContext,
} from "../../core";
import type { IAlpJobAssign, IAlpJobUrls } from "../agent";
import { toJobOutput } from "./job.runner";
import { JobHandlerRegistry, resolveDefinition } from "./job-handler.registry";
import { JobProgressWriter } from "./job-progress.writer";
import { JobRun } from "./job-run.entity";
import { JobRunRepository } from "./job-run.repository";
import {
  appendLogTail,
  clampProgress,
  JobRunTracker,
  secondsFromNow,
} from "./job-run.tracker";
import { JobsError } from "./jobs.errors";
import { EJobRunStatus, IJobRunFiles } from "./jobs.types";
import { managerDb, PgBossService } from "./pg-boss.service";

type TExternalHandler = IExternalJobHandler<unknown, unknown>;

/** Задача агента: id и попытка (барьер против устаревшего исполнителя). */
export interface IAgentJobRef {
  jobId: string;
  attempt: number;
}

export interface IAgentJobProgress extends IAgentJobRef {
  progress?: number;
  text?: string;
  log?: string[];
}

export interface IAgentJobEvent extends IAgentJobRef {
  seq: number;
  type: string;
  data?: unknown;
}

export interface IAgentJobFailure {
  code: string;
  message: string;
  retryable: boolean;
}

/** Итог сверки задач агента при `hello`. */
export interface IAgentJobReconcile {
  /** Выданы, но агент их не получил — выдать снова (та же попытка). */
  resend: IAlpJobAssign[];
  /** Агент выполняет, а сервер их уже не числит за ним — прервать. */
  cancel: IAgentJobRef[];
  /** Агент выполняет, а пользователь попросил остановить. */
  stop: IAgentJobRef[];
}

const AGENT_LOST = {
  code: "AGENT_LOST",
  message: "Агент перезапустился и потерял задачу",
  retryable: true,
};

const normalizeFiles = (files: ExternalJobFiles): IJobRunFiles => ({
  inputs: { ...files.inputs },
  outputs: Object.fromEntries(
    Object.entries(files.outputs ?? {}).map(([name, value]) => [
      name,
      typeof value === "string" ? { key: value } : value,
    ]),
  ),
});

/** Писатель прогресса без обновлений дольше — забывается. */
const WRITER_IDLE_MS = 10 * 60_000;

const isLeaseLost = (err: unknown): boolean =>
  err instanceof HttpException && err.code === JobsError.codes.LEASE_LOST;

const refKey = (ref: IAgentJobRef): string => `${ref.jobId}:${ref.attempt}`;

/**
 * Внешние задачи, выполняемые агентами: выдача с арендой за агентом,
 * прогресс и события, свежие ссылки на файлы, итог. Результат переносит в
 * домен хук очереди `onComplete` — в транзакции завершения. Каждое действие
 * агента проверяет, что задача всё ещё за ним и попытка та же.
 */
@Injectable()
export class ExternalJobService {
  /** Прогресс пишется в БД не чаще интервала; на задачу — свой писатель. */
  private readonly _writers = new Map<
    string,
    { writer: JobProgressWriter; usedAt: number }
  >();

  constructor(
    @inject(PgBossService) private readonly _boss: PgBossService,
    @inject(JobHandlerRegistry) private readonly _registry: JobHandlerRegistry,
    @inject(JobRunTracker) private readonly _tracker: JobRunTracker,
    @inject(JobRunRepository) private readonly _runs: JobRunRepository,
    @inject(DataSource) private readonly _dataSource: DataSource,
    @inject(FileStorage) @optional() private readonly _storage?: FileStorage,
  ) {}

  /** Обработчик внешней очереди; `undefined` — очередь не внешняя или неизвестна. */
  handler(queue: string): TExternalHandler | undefined {
    return this._registry.external(queue);
  }

  /** Внешние очереди процесса. */
  externalQueues(): string[] {
    return this._registry
      .all()
      .filter(handler => handler.definition.external)
      .map(handler => handler.definition.queue);
  }

  /** Взять из pg-boss до `max` задач очереди и выдать агенту. */
  async take(
    queue: string,
    max: number,
    agentId: string,
  ): Promise<IAlpJobAssign[]> {
    const handler = this.handler(queue);

    if (!handler || max <= 0) return [];

    const boss = await this._boss.ready();
    const jobs = await boss.fetch<unknown>(queue, {
      batchSize: max,
      includeMetadata: true,
    });
    const assigned: IAlpJobAssign[] = [];

    for (const job of jobs) {
      const assign = await this.lease(handler, job, agentId);

      if (assign) assigned.push(assign);
    }

    return assigned;
  }

  /** Агент принял задачу: дальше её потеря при рестарте агента — провал попытки. */
  async accept(agentId: string, ref: IAgentJobRef): Promise<void> {
    await this._runs.update(
      {
        id: ref.jobId,
        agentId,
        attempt: ref.attempt,
        status: EJobRunStatus.RUNNING,
      },
      { acceptedAt: new Date() },
    );
  }

  /** Прогресс, текст и строки лога; частые обновления схлопываются. */
  async progress(agentId: string, update: IAgentJobProgress): Promise<void> {
    const run = await this._held(agentId, update);

    if (!run) return;

    const writer = this._writer(run.id);

    if (update.log?.length) update.log.forEach(line => void writer.log(line));
    if (update.progress !== undefined) {
      await writer.progress(update.progress, update.text);
    } else if (update.text !== undefined) {
      await writer.progress(run.progress, update.text);
    }
  }

  /** Доменное событие задачи; повтор (seq не больше принятого) — мимо. */
  async event(agentId: string, event: IAgentJobEvent): Promise<void> {
    const run = await this._heldOrThrow(agentId, event);

    if (event.seq <= run.eventSeq) return;

    const handler = this._handlerOf(run);

    if (handler.onEvent) {
      const info = await this.jobInfo(run);

      try {
        await requestContext.run(
          { requestId: `job:${run.queue}:${run.id}` },
          () => handler.onEvent!(info, { type: event.type, data: event.data }),
        );
      } catch (err) {
        logger.error(
          { err, jobId: run.id, event: event.type },
          "[Jobs] onEvent внешней задачи упал",
        );
      }
    }

    await this._runs.update({ id: run.id }, { eventSeq: event.seq });
  }

  /** Свежие подписанные ссылки на файлы задачи (все или перечисленные). */
  async urls(
    agentId: string,
    ref: IAgentJobRef,
    names: { inputs?: string[]; outputs?: string[] },
  ): Promise<IAlpJobUrls> {
    const run = await this._heldOrThrow(agentId, ref);
    const files = run.files ?? { inputs: {}, outputs: {} };
    const pick = <T>(all: Record<string, T>, wanted?: string[]) =>
      wanted
        ? Object.fromEntries(
            Object.entries(all).filter(([name]) => wanted.includes(name)),
          )
        : all;
    const signed = await this.signFiles({
      inputs: pick(files.inputs, names.inputs),
      outputs: pick(files.outputs, names.outputs),
    });

    return {
      inputs: signed.inputs,
      outputs: signed.outputs,
      expiresAt: signed.expiresAt,
    };
  }

  async complete(
    agentId: string,
    ref: IAgentJobRef,
    result: unknown,
  ): Promise<void> {
    const run = await this._heldOrThrow(agentId, ref);
    const handler = this._handlerOf(run);
    const boss = await this._boss.ready();
    const info = await this.jobInfo(run);
    const reported = result ?? null;

    await this._flushProgress(run.id);

    try {
      await requestContext.run(
        { requestId: `job:${run.queue}:${run.id}` },
        () =>
          this._dataSource.transaction(async manager => {
            await handler.onComplete(
              {
                ...info,
                manager,
                outputs: Object.fromEntries(
                  Object.entries(run.files?.outputs ?? {}).map(([name, o]) => [
                    name,
                    o.key,
                  ]),
                ),
              },
              reported,
            );

            const settled = await boss.complete(
              run.queue,
              run.id,
              toJobOutput(reported) ?? null,
              { db: managerDb(manager) },
            );

            if (!(settled as { affected?: number }).affected) {
              throw JobsError.LEASE_LOST();
            }

            await this._tracker.complete(run, reported, manager);
          }),
      );
    } catch (err) {
      if (isLeaseLost(err)) throw err;

      logger.error(
        { err, queue: run.queue, jobId: run.id },
        "[Jobs] onComplete внешней задачи упал — задача на повтор",
      );
      await this.settleFailure(run, handler, {
        code: "COMPLETE_HOOK_FAILED",
        message: "Не удалось сохранить результат задачи",
        retryable: true,
      });
      throw err;
    }

    this._tracker.publish(run);
  }

  async fail(
    agentId: string,
    ref: IAgentJobRef,
    failure: IAgentJobFailure,
  ): Promise<void> {
    const run = await this._heldOrThrow(agentId, ref);

    await this._flushProgress(run.id);
    await this.settleFailure(run, this._handlerOf(run), failure);
  }

  /**
   * Агент не может выполнить задачу (очередь не обслуживается, нет места):
   * вернуть её в очередь без траты попытки.
   */
  async reject(
    agentId: string,
    ref: IAgentJobRef,
    reason: { code: string; message: string },
  ): Promise<void> {
    const run = await this._held(agentId, ref);

    if (!run) return;

    await this._boss.release(run.queue, run.id);
    await this._tracker.update(run, {
      status: EJobRunStatus.QUEUED,
      agentId: null,
      acceptedAt: null,
      leaseUntil: null,
    });
    logger.warn(
      { jobId: run.id, agentId, ...reason },
      "[Jobs] Агент отклонил задачу — она снова в очереди",
    );
  }

  /** Пульс агента: продлить аренды перечисленных задач, которые за ним. */
  async extendLeases(agentId: string, refs: IAgentJobRef[]): Promise<void> {
    if (!refs.length) return;

    const runs = await this._runs.find({
      where: {
        id: In(refs.map(ref => ref.jobId)),
        agentId,
        status: EJobRunStatus.RUNNING,
      },
    });
    const listed = new Set(refs.map(refKey));
    const byLease = new Map<number, string[]>();

    for (const run of runs) {
      if (!listed.has(refKey({ jobId: run.id, attempt: run.attempt }))) {
        continue;
      }

      const handler = this.handler(run.queue);

      if (!handler) continue;

      const { leaseSeconds } = resolveDefinition(handler.definition);

      byLease.set(leaseSeconds, [...(byLease.get(leaseSeconds) ?? []), run.id]);
    }

    for (const [seconds, ids] of byLease) {
      await this._runs.update(
        { id: In(ids), status: EJobRunStatus.RUNNING },
        { leaseUntil: secondsFromNow(seconds) },
      );
    }
  }

  /**
   * Сверка при `hello`: что сервер числит за агентом и что агент выполняет.
   * Не дошедшие до агента — выдать снова; потерянные после принятия —
   * провалить попытку (повтор по политике очереди); лишние у агента — прервать.
   */
  async reconcile(
    agentId: string,
    reported: IAgentJobRef[],
  ): Promise<IAgentJobReconcile> {
    const running = await this._runs.find({
      where: { agentId, status: EJobRunStatus.RUNNING },
    });
    const reportedKeys = new Set(reported.map(refKey));
    const runningKeys = new Set(
      running.map(run => refKey({ jobId: run.id, attempt: run.attempt })),
    );
    const result: IAgentJobReconcile = { resend: [], cancel: [], stop: [] };

    for (const run of running) {
      const ref = { jobId: run.id, attempt: run.attempt };

      if (reportedKeys.has(refKey(ref))) {
        if (run.stopRequested) result.stop.push(ref);
        continue;
      }

      const handler = this.handler(run.queue);

      if (!handler) continue;
      if (run.acceptedAt) {
        await this.settleFailure(run, handler, AGENT_LOST);
        continue;
      }

      const info = await this.jobInfo(run);

      result.resend.push(await this.assignment(handler, info, run.files));
    }

    result.cancel = reported.filter(ref => !runningKeys.has(refKey(ref)));

    return result;
  }

  /** Задача по id, если она за этим агентом в этой попытке. */
  async findHeld(agentId: string, ref: IAgentJobRef): Promise<JobRun | null> {
    return this._held(agentId, ref);
  }

  /** Выдать задачу агенту: аренда, файлы, подписанные ссылки. */
  private async lease(
    handler: TExternalHandler,
    job: JobWithMetadata<unknown>,
    agentId: string,
  ): Promise<IAlpJobAssign | null> {
    const { queue, leaseSeconds } = resolveDefinition(handler.definition);
    const info: ExternalJobInfo = {
      id: job.id,
      queue,
      data: job.data,
      attempt: job.retryCount,
    };

    try {
      const files = handler.io ? normalizeFiles(await handler.io(info)) : null;
      const run = await this._tracker.start({
        id: job.id,
        queue,
        attempt: info.attempt,
        leaseSeconds,
        createIfMissing: true,
        files,
        agentId,
      });

      if (!run || run.status !== EJobRunStatus.RUNNING) {
        // Отменили между выборкой и арендой — снять и в pg-boss.
        const boss = await this._boss.ready();

        await boss.cancel(queue, job.id);

        return null;
      }

      return await this.assignment(handler, info, files);
    } catch (err) {
      logger.error(
        { err, queue, jobId: job.id, agentId },
        "[Jobs] Не удалось выдать задачу агенту",
      );

      const boss = await this._boss.ready();

      await boss.fail(queue, job.id, {
        code: "ASSIGN_FAILED",
        message: err instanceof Error ? err.message : String(err),
      });

      return null;
    }
  }

  private async assignment(
    handler: TExternalHandler,
    info: ExternalJobInfo,
    files: IJobRunFiles | null,
  ): Promise<IAlpJobAssign> {
    const { leaseSeconds } = resolveDefinition(handler.definition);
    const signed = await this.signFiles(files);

    return {
      jobId: info.id,
      attempt: info.attempt,
      queue: info.queue,
      data: info.data,
      leaseSeconds,
      inputs: signed.inputs,
      outputs: signed.outputs,
      ...(signed.expiresAt && { urlsExpireAt: signed.expiresAt }),
    };
  }

  private async signFiles(files: IJobRunFiles | null): Promise<IAlpJobUrls> {
    const inputs = Object.entries(files?.inputs ?? {});
    const outputs = Object.entries(files?.outputs ?? {});
    const expiresAt = Date.now() + config.storage.signedUrlTtlSeconds * 1000;

    if (!inputs.length && !outputs.length) {
      return { inputs: {}, outputs: {}, expiresAt };
    }

    const storage = this._storage;

    if (!storage) throw JobsError.STORAGE_UNAVAILABLE();

    return {
      inputs: Object.fromEntries(
        await Promise.all(
          inputs.map(async ([name, key]) => [
            name,
            await storage.signedGetUrl(key),
          ]),
        ),
      ),
      outputs: Object.fromEntries(
        await Promise.all(
          outputs.map(async ([name, { key, contentType }]) => [
            name,
            {
              url: await storage.signedPutUrl(key, { contentType }),
              ...(contentType && { contentType }),
            },
          ]),
        ),
      ),
      expiresAt,
    };
  }

  private async jobInfo(run: JobRun): Promise<ExternalJobInfo> {
    const boss = await this._boss.ready();
    const [job] = await boss.findJobs<unknown>(run.queue, { id: run.id });

    return {
      id: run.id,
      queue: run.queue,
      data: job?.data ?? null,
      attempt: run.attempt,
    };
  }

  /** Провалить попытку в pg-boss и привести запись к исходу. */
  private async settleFailure(
    run: JobRun,
    handler: TExternalHandler,
    failure: IAgentJobFailure,
  ): Promise<void> {
    const output = { code: failure.code, message: failure.message };

    if (failure.retryable) {
      const boss = await this._boss.ready();

      await boss.fail(run.queue, run.id, output);
    } else {
      await this._boss.failFinal(run.queue, run.id, output);
    }

    const ref = await this._boss.findJob(run.id);
    const final = !ref || ref.state === "failed" || ref.state === "cancelled";

    await this._tracker.fail(run, output, final);

    if (handler.onFail) {
      try {
        await handler.onFail(await this.jobInfo(run), { ...failure, final });
      } catch (err) {
        logger.error(
          { err, jobId: run.id },
          "[Jobs] onFail внешней задачи упал",
        );
      }
    }
  }

  private _handlerOf(run: JobRun): TExternalHandler {
    const handler = this.handler(run.queue);

    if (!handler) throw JobsError.NOT_EXTERNAL({ queue: run.queue });

    return handler;
  }

  /** Задача за агентом в этой попытке и не отменена; иначе `null`. */
  private async _held(
    agentId: string,
    ref: IAgentJobRef,
  ): Promise<JobRun | null> {
    const run = await this._tracker.find(ref.jobId);

    return run &&
      run.status === EJobRunStatus.RUNNING &&
      !run.cancelRequested &&
      run.agentId === agentId &&
      run.attempt === ref.attempt
      ? run
      : null;
  }

  private async _heldOrThrow(
    agentId: string,
    ref: IAgentJobRef,
  ): Promise<JobRun> {
    const run = await this._held(agentId, ref);

    if (!run) throw JobsError.LEASE_LOST();

    return run;
  }

  private _writer(jobId: string): JobProgressWriter {
    const now = Date.now();
    const entry = this._writers.get(jobId);

    if (entry) {
      entry.usedAt = now;

      return entry.writer;
    }

    // Задачи, ушедшие без итога (отмена, аренда истекла), — забыть.
    for (const [id, idle] of this._writers) {
      if (now - idle.usedAt > WRITER_IDLE_MS) {
        idle.writer.dispose();
        this._writers.delete(id);
      }
    }

    const writer = new JobProgressWriter(async (value, text, lines) => {
      const run = await this._tracker.find(jobId);

      if (run?.status !== EJobRunStatus.RUNNING) return;

      await this._tracker.update(run, {
        ...(value !== undefined && { progress: clampProgress(value) }),
        ...(text !== undefined && { progressText: text }),
        ...(lines.length > 0 && {
          logTail: appendLogTail(run.logTail, lines),
        }),
      });
    });

    this._writers.set(jobId, { writer, usedAt: now });

    return writer;
  }

  /** Дописать накопленный прогресс до итога и забыть писателя задачи. */
  private async _flushProgress(jobId: string): Promise<void> {
    const entry = this._writers.get(jobId);

    if (!entry) return;

    this._writers.delete(jobId);
    try {
      await entry.writer.flush();
    } finally {
      entry.writer.dispose();
    }
  }
}
