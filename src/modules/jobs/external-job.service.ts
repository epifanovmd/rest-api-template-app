import { inject, optional } from "inversify";
import type { JobWithMetadata } from "pg-boss";
import { DataSource } from "typeorm";

import { config } from "../../config";
import {
  EXTERNAL_JOB_EXECUTOR,
  ExternalJobAssignment,
  ExternalJobFiles,
  ExternalJobFileUrls,
  ExternalJobInfo,
  ExternalJobUpdate,
  FileStorage,
  IExternalJobExecutor,
  Injectable,
  JobError,
  logger,
} from "../../core";
import { JobHandlerRegistry } from "./job-handler.registry";
import { JobRun } from "./job-run.entity";
import { JobRunRepository } from "./job-run.repository";
import {
  clampProgress,
  JobRunTracker,
  secondsFromNow,
} from "./job-run.tracker";
import {
  EJobRunStatus,
  IJobRunError,
  IJobRunOutput,
  JOB_EXTERNAL_CLAIM_SECONDS,
  JOB_EXTERNAL_KICK_BATCH,
  SETTLED_JOB_RUN_STATUSES,
} from "./jobs.types";
import { PgBossService } from "./pg-boss.service";

/** Сколько задач с истёкшим сроком обрабатывается за проход. */
const DEADLINE_BATCH = 100;
const PROGRESS_TEXT_MAX = 200;

const COMPLETE_FAILED = "JOB_COMPLETE_FAILED";
const EXTERNAL_LOST: IJobRunError = {
  code: "EXTERNAL_JOB_LOST",
  message: "Воркер не знает об этой задаче (перезапущен без сохранения хода)",
};
const TIMED_OUT: IJobRunError = {
  code: "JOB_TIMEOUT",
  message: "Внешняя задача не закончилась в срок",
};
const NO_EXECUTOR = new JobError(
  "EXTERNAL_EXECUTOR_MISSING",
  "Исполнитель внешних очередей не подключён",
  false,
);
const NO_STORAGE = new JobError(
  "STORAGE_UNAVAILABLE",
  "Файлы задачи: хранилище не подключено",
  false,
);

const errorOf = (err: unknown): IJobRunError =>
  err instanceof JobError
    ? { code: err.code, message: err.message }
    : { code: "JOB_DISPATCH_FAILED", message: (err as Error).message };

/** Поля связи записи с задачей у воркера. */
type TAssignPatch = Partial<
  Pick<JobRun, "agentId" | "worker" | "externalId" | "startedAt" | "deadlineAt">
>;

const assignmentOf = (run: JobRun): ExternalJobAssignment | null =>
  run.agentId && run.worker && run.externalId
    ? { agentId: run.agentId, worker: run.worker, workId: run.externalId }
    : null;

/** Ключи выходных файлов: имя → ключ. */
const outputKeys = (files: ExternalJobFiles): Record<string, string> =>
  Object.fromEntries(
    Object.entries(files.outputs ?? {}).map(([name, output]) => [
      name,
      typeof output === "string" ? output : output.key,
    ]),
  );

/** Подписать ссылки параллельно: имя → URL. */
const signAll = async (
  entries: [string, Promise<string>][],
): Promise<Record<string, string>> =>
  Object.fromEntries(
    await Promise.all(
      entries.map(async ([name, url]) => [name, await url] as const),
    ),
  );

/**
 * Внешние задачи: передача задачи воркеру агента (`IExternalJobExecutor`) и
 * отражение её хода в записи `job_runs`. Передача — сразу после постановки
 * (`startNow` по сигналу после коммита, при подключении агента) или задачей
 * pg-boss (`dispatch`: повторы, ожидание агента); дважды задача не
 * передаётся — запись берётся условным UPDATE (`claimDispatch`). Быстрая
 * задача завершается ответом воркера, долгая — событиями (`onUpdate`
 * исполнителя): итог — хук `onComplete` в транзакции завершения,
 * окончательная ошибка — `onFail`. После подключения агента его задачи
 * сверяются опросом; срок задачи (`expireInSeconds`) проверяет cron.
 */
@Injectable()
export class ExternalJobService {
  private _unsubscribe: (() => void)[] = [];

  constructor(
    @inject(JobRunRepository) private readonly _runs: JobRunRepository,
    @inject(JobRunTracker) private readonly _tracker: JobRunTracker,
    @inject(JobHandlerRegistry) private readonly _registry: JobHandlerRegistry,
    @inject(DataSource) private readonly _dataSource: DataSource,
    @inject(PgBossService) private readonly _boss: PgBossService,
    @inject(EXTERNAL_JOB_EXECUTOR)
    @optional()
    private readonly _executor?: IExternalJobExecutor,
    @inject(FileStorage) @optional() private readonly _storage?: FileStorage,
  ) {}

  /** Процесс может передавать внешние задачи воркерам. */
  get canDispatch(): boolean {
    return this._executor?.canDispatch === true;
  }

  /** Слушать изменения задач и подключения агентов в этом процессе. */
  listen(): void {
    const executor = this._executor;

    if (!executor || this._unsubscribe.length) return;

    this._unsubscribe = [
      executor.onUpdate(update => this.apply(update)),
      executor.onReconnect(agentId => void this.onAgentReady(agentId)),
    ];
  }

  unlisten(): void {
    for (const off of this._unsubscribe) off();
    this._unsubscribe = [];
  }

  /**
   * Передать ждущую задачу сейчас, если подходящий агент на связи; нет —
   * задача ждёт повтора pg-boss. Задачу передаёт другой процесс — ничего.
   */
  async startNow(id: string): Promise<void> {
    if (!this.canDispatch) return;

    const run = await this._runs.findById(id);

    if (!run || run.status !== EJobRunStatus.QUEUED || run.externalId) return;
    if (!this._registry.external(run.queue)) return;
    if (!(await this.claim(run, run.attempt))) return;

    try {
      await this.submit(run, await this._boss.findJobData(id), run.attempt);
    } catch (err) {
      if (err instanceof JobError && !err.retryable) {
        await this.settleFailed(run, errorOf(err));

        return;
      }

      logger.info(
        { jobId: id, errorCode: errorOf(err).code },
        "[Jobs] Внешняя задача ждёт агента",
      );
      await this.release(run.id, errorOf(err), run.attempt);
    }
  }

  /**
   * Задача pg-boss: передать задачу воркеру, если её ещё не передали. Ошибка
   * без смысла повтора или на последней попытке — запись падает; иначе —
   * повтор по политике очереди.
   */
  async dispatch(job: JobWithMetadata<unknown>): Promise<void> {
    const run = await this._runs.findById(job.id);

    if (!run || SETTLED_JOB_RUN_STATUSES.includes(run.status)) return;
    if (run.externalId) return;
    if (!(await this.claim(run, job.retryCount))) {
      throw new JobError("JOB_DISPATCHING", "Задачу передаёт другой процесс");
    }

    try {
      await this.submit(run, job.data, job.retryCount);
    } catch (err) {
      const final =
        (err instanceof JobError && !err.retryable) ||
        job.retryCount >= job.retryLimit;

      if (!final) {
        await this.release(run.id, errorOf(err), job.retryCount + 1);
        throw err;
      }

      logger.warn({ err, jobId: run.id }, "[Jobs] Задача не передана воркеру");
      await this.settleFailed(run, errorOf(err));
    }
  }

  /** Отменить задачу у воркера (запись отменяет очередь). */
  async cancelJob(run: JobRun): Promise<void> {
    const assignment = assignmentOf(run);

    if (assignment) await this._executor?.cancel(assignment);
  }

  /** Провалить задачи с истёкшим сроком и отменить их у воркеров. */
  async failExpired(now = new Date()): Promise<number> {
    const runs = await this._runs.findExpiredExternal(now, DEADLINE_BATCH);

    for (const run of runs) {
      try {
        if (await this.settleFailed(run, TIMED_OUT)) {
          await this.cancelJob(run);
        }
      } catch (err) {
        logger.warn({ err, jobId: run.id }, "[Jobs] Срок внешней задачи");
      }
    }

    return runs.length;
  }

  /**
   * Сверить задачи агента после его подключения: ход и итог — опросом
   * воркера (`GET /jobs/{id}`); воркер о задаче не знает — задача падает.
   */
  async reconcile(agentId: string): Promise<void> {
    if (!this._executor) return;

    const runs = await this._runs.findActiveExternalByAgent(agentId);

    for (const run of runs) {
      const assignment = assignmentOf(run);

      if (!assignment) continue;

      try {
        const update = await this._executor.poll(assignment);

        if (update) await this.apply({ ...update, jobId: run.id });
        else await this.settleFailed(run, EXTERNAL_LOST);
      } catch (err) {
        logger.warn({ err, jobId: run.id }, "[Jobs] Сверка внешней задачи");
      }
    }
  }

  /** Ждущие внешние задачи — передать сейчас (агент подключился). */
  async startQueued(): Promise<void> {
    const queues = this._registry
      .all()
      .filter(handler => handler.definition.external === true)
      .map(handler => handler.definition.queue);
    const ids = await this._runs.findQueuedExternalIds(
      queues,
      JOB_EXTERNAL_KICK_BATCH,
    );

    for (const id of ids) {
      await this.startNow(id).catch(err =>
        logger.warn({ err, jobId: id }, "[Jobs] Передача ждущей задачи"),
      );
    }
  }

  /**
   * Изменение задачи от воркера. Идемпотентно: повтор события ничего не
   * меняет, итог записывается один раз (условный UPDATE активной записи).
   */
  async apply(update: ExternalJobUpdate): Promise<void> {
    const run = update.jobId
      ? await this._runs.findById(update.jobId)
      : await this._runs.findByAssignment(update.agentId, update.workId);

    if (!run || SETTLED_JOB_RUN_STATUSES.includes(run.status)) return;
    // Задача другой попытки (передали другому агенту) — не эта.
    if (
      run.agentId &&
      (run.agentId !== update.agentId || run.externalId !== update.workId)
    ) {
      return;
    }

    switch (update.kind) {
      case "progress":
        await this._tracker.updateIfActive(run, {
          ...this.assignPatch(run, update),
          status: EJobRunStatus.RUNNING,
          ...(update.progress !== undefined && {
            progress: clampProgress(update.progress),
          }),
          ...(update.text !== undefined && {
            progressText: update.text.slice(0, PROGRESS_TEXT_MAX),
          }),
        });
        break;
      case "done":
        await this.complete(run, update);
        break;
      case "failed":
        await this.settleFailed(
          run,
          update.error ?? {
            code: "JOB_FAILED",
            message: "Задача не выполнена",
          },
          this.assignPatch(run, update),
        );
        break;
      case "cancelled":
        await this._tracker.updateIfActive(run, {
          ...this.assignPatch(run, update),
          status: EJobRunStatus.CANCELLED,
          cancelRequested: true,
          finishedAt: new Date(),
        });
        break;
    }
  }

  /** Агент на связи: сверить его задачи и передать ждущие. */
  private async onAgentReady(agentId: string): Promise<void> {
    await this.reconcile(agentId);
    await this.startQueued().catch(err =>
      logger.warn({ err, agentId }, "[Jobs] Передача ждущих задач"),
    );
  }

  /** Взять запись на передачу; `false` — её передаёт другой процесс или уже передали. */
  private async claim(run: JobRun, attempt: number): Promise<boolean> {
    const now = new Date();
    const claimed = await this._runs.claimDispatch(
      run.id,
      attempt,
      now,
      new Date(now.getTime() - JOB_EXTERNAL_CLAIM_SECONDS * 1000),
    );

    if (claimed) Object.assign(run, { attempt, startedAt: now });

    return claimed;
  }

  /** Вернуть запись в ожидание: передача не удалась, будет повтор. */
  private async release(
    id: string,
    error: IJobRunError,
    attempt: number,
  ): Promise<void> {
    if (await this._runs.releaseDispatch(id, { error, attempt })) {
      await this.republish(id);
    }
  }

  /** Свежий снимок записи — подписчикам. */
  private async republish(id: string): Promise<void> {
    const fresh = await this._runs.findById(id);

    if (fresh) this._tracker.publish(fresh);
  }

  /** Передать взятую задачу воркеру и отразить ответ: итог или связь с задачей. */
  private async submit(
    run: JobRun,
    data: unknown,
    attempt: number,
  ): Promise<void> {
    const handler = this._registry.external(run.queue);
    const definition = this._registry.definition(run.queue);

    if (!handler || !definition?.job) {
      throw new JobError("UNKNOWN_QUEUE", "Очередь не внешняя", false);
    }
    if (!this._executor) throw NO_EXECUTOR;

    const info: ExternalJobInfo = {
      id: run.id,
      queue: run.queue,
      data,
      attempt,
    };
    const files = await this.signFiles(
      handler.io ? await handler.io(info) : {},
      definition.expireInSeconds,
    );
    const target = {
      ...definition.job,
      type: handler.jobType?.(info) ?? definition.job.type,
    };

    await this.setTarget(run, target.type, target.worker);

    const update = await this._executor.dispatch({
      jobId: run.id,
      queue: run.queue,
      attempt,
      data,
      target,
      ...(files && { files }),
    });
    const attached = await this._runs.attachExternal(
      run.id,
      update,
      new Date(),
      secondsFromNow(definition.expireInSeconds),
    );

    if (update.kind !== "progress") {
      await this.apply({ ...update, jobId: run.id });

      return;
    }
    if (attached) await this.republish(run.id);

    const fresh = await this._runs.findById(run.id);

    // Задачу отменили, пока она передавалась, — отменить и у воркера.
    if (fresh?.cancelRequested) await this._executor.cancel(update);
  }

  /** Тип задачи воркера и воркер (если очередь его называет) — в запись до передачи. */
  private async setTarget(
    run: JobRun,
    jobType: string,
    worker: string | undefined,
  ): Promise<void> {
    const patch = {
      jobType,
      ...(worker && !run.agentId && { worker }),
    };

    if (
      run.jobType === patch.jobType &&
      (patch.worker === undefined || run.worker === patch.worker)
    ) {
      return;
    }

    await this._runs.setTarget(run.id, patch);
    Object.assign(run, patch);
  }

  /**
   * Файлы итога, которые воркер загрузил: имя, ключ, размер. Объекта нет —
   * выход пропускается; хранилище не ответило — без размера.
   */
  private async storedOutputs(
    outputs: Record<string, string>,
  ): Promise<IJobRunOutput[] | null> {
    const storage = this._storage;
    const entries = Object.entries(outputs);

    if (!storage || !entries.length) return null;

    const stored = await Promise.all(
      entries.map(async ([name, key]): Promise<IJobRunOutput | null> => {
        try {
          const object = await storage.stat(key);

          return object ? { name, key, size: object.size } : null;
        } catch (err) {
          logger.warn({ err, key }, "[Jobs] Файл итога задачи");

          return { name, key, size: null };
        }
      }),
    );
    const found = stored.filter(
      (output): output is IJobRunOutput => output !== null,
    );

    return found.length ? found : null;
  }

  /** Подписанные ссылки на файлы задачи: срок — не меньше срока задачи. */
  private async signFiles(
    files: ExternalJobFiles,
    expireInSeconds: number,
  ): Promise<ExternalJobFileUrls | null> {
    const inputs = Object.entries(files.inputs ?? {});
    const outputs = Object.entries(files.outputs ?? {});

    if (!inputs.length && !outputs.length) return null;

    const storage = this._storage;

    if (!storage) throw NO_STORAGE;

    const ttlSeconds = Math.max(
      config.storage.signedUrlTtlSeconds,
      expireInSeconds,
    );

    return {
      ...(inputs.length > 0 && {
        inputs: await signAll(
          inputs.map(([name, key]) => [
            name,
            storage.signedGetUrl(key, { ttlSeconds }),
          ]),
        ),
      }),
      ...(outputs.length > 0 && {
        outputs: await signAll(
          outputs.map(([name, output]) => {
            const { key, contentType } =
              typeof output === "string"
                ? { key: output, contentType: undefined }
                : output;

            return [
              name,
              storage.signedPutUrl(key, {
                ttlSeconds,
                ...(contentType && { contentType }),
              }),
            ];
          }),
        ),
      }),
    };
  }

  /** Поля связи с задачей: событие пришло раньше ответа на запуск. */
  private assignPatch(run: JobRun, update: ExternalJobUpdate): TAssignPatch {
    if (run.agentId) return {};

    const definition = this._registry.definition(run.queue);

    return {
      agentId: update.agentId,
      worker: update.worker,
      externalId: update.workId,
      startedAt: run.startedAt ?? new Date(),
      ...(definition && {
        deadlineAt: secondsFromNow(definition.expireInSeconds),
      }),
    };
  }

  /** Итог — в транзакции с хуком `onComplete`; ошибка хука — задача падает. */
  private async complete(
    run: JobRun,
    update: ExternalJobUpdate,
  ): Promise<void> {
    const handler = this._registry.external(run.queue);
    const info = await this.infoOf(run);
    const outputs = outputKeys(handler?.io ? await handler.io(info) : {});
    const patch = {
      ...this.assignPatch(run, update),
      status: EJobRunStatus.COMPLETED,
      progress: 1,
      result: update.result ?? null,
      error: null,
      outputs: await this.storedOutputs(outputs),
      finishedAt: new Date(),
    };
    let settled = false;

    try {
      await this._dataSource.transaction(async manager => {
        settled = await this._tracker.updateIfActive(
          { ...run },
          patch,
          manager,
        );
        if (settled) {
          await handler?.onComplete(
            { ...info, manager, outputs },
            update.result,
          );
        }
      });
    } catch (err) {
      logger.error({ err, jobId: run.id }, "[Jobs] onComplete упал");
      await this.settleFailed(run, {
        code: COMPLETE_FAILED,
        message: (err as Error).message,
      });

      return;
    }

    if (settled) this._tracker.publish(Object.assign(run, patch));
  }

  /** Задача для хуков: данные — из pg-boss (запись их не хранит). */
  private async infoOf(run: JobRun): Promise<ExternalJobInfo> {
    return {
      id: run.id,
      queue: run.queue,
      data: await this._boss.findJobData(run.id),
      attempt: run.attempt,
    };
  }

  /** Окончательный провал и хук `onFail`; `false` — задача уже завершена. */
  private async settleFailed(
    run: JobRun,
    error: IJobRunError,
    extra: TAssignPatch = {},
  ): Promise<boolean> {
    const settled = await this._tracker.updateIfActive(run, {
      ...extra,
      status: EJobRunStatus.FAILED,
      error,
      finishedAt: new Date(),
    });
    const handler = this._registry.external(run.queue);

    if (!settled || !handler?.onFail) return settled;

    try {
      await handler.onFail(await this.infoOf(run), error);
    } catch (err) {
      logger.warn({ err, jobId: run.id }, "[Jobs] Хук onFail упал");
    }

    return settled;
  }
}
