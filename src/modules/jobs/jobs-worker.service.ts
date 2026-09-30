import { inject, optional } from "inversify";
import type { JobWithMetadata } from "pg-boss";
import { DataSource } from "typeorm";

import {
  ExternalJobEvent,
  ExternalJobFiles,
  ExternalJobInfo,
  FileStorage,
  hasPermission,
  HttpException,
  IExternalJobHandler,
  Injectable,
  logger,
  requestContext,
} from "../../core";
import {
  IClaimedJobDto,
  IClaimJobsBody,
  ICompleteJobBody,
  IFailJobBody,
  IHeartbeatJobBody,
  IHeartbeatResultDto,
  ISignalJobBody,
  IWorkerQueueStatusDto,
} from "./dto/worker.dto";
import { toJobOutput } from "./job.runner";
import { JobHandlerRegistry, resolveDefinition } from "./job-handler.registry";
import { JobRun } from "./job-run.entity";
import {
  appendLogTail,
  clampProgress,
  JobRunTracker,
  secondsFromNow,
} from "./job-run.tracker";
import { JobSignals } from "./job-signals";
import { JobWorkerTracker } from "./job-worker.tracker";
import { JobsError } from "./jobs.errors";
import {
  EJobRunStatus,
  IJobRunFiles,
  JOB_AVAILABLE_CHANNEL,
  JOB_CANCEL_CHANNEL,
  JOB_SETTLED_CHANNEL,
  JOB_STOP_CHANNEL,
  TJobSignalChannel,
  WORKER_CLAIM_MAX_WAIT_SECONDS,
  WORKER_CLAIM_POLL_MS,
  WORKER_SIGNAL_MAX_WAIT_SECONDS,
  WORKER_SIGNAL_POLL_MS,
} from "./jobs.types";
import { managerDb, PgBossService } from "./pg-boss.service";

/** Кто вызывает API воркеров: scopes API-ключа и его id. */
export interface IWorkerCaller {
  scopes: string[];
  /** `apikey:<id>` — сессия ключа. */
  keyId?: string | null;
}

type TExternalHandler = IExternalJobHandler<unknown, unknown>;

/** Scope ключа, разрешающий очередь. */
export const workerScope = (queue: string): string => `worker:${queue}`;

const normalizeFiles = (files: ExternalJobFiles): IJobRunFiles => ({
  inputs: { ...files.inputs },
  outputs: Object.fromEntries(
    Object.entries(files.outputs ?? {}).map(([name, value]) => [
      name,
      typeof value === "string" ? { key: value } : value,
    ]),
  ),
});

const isLeaseLost = (err: unknown): boolean =>
  err instanceof HttpException && err.code === JobsError.codes.LEASE_LOST;

/**
 * HTTP-фасад pg-boss для внешних воркеров на любом языке: выдача задач с
 * арендой, heartbeat с прогрессом и отменой, завершение и ошибка. Результат
 * переносит в домен хук очереди `onComplete` — в транзакции завершения.
 */
@Injectable()
export class JobsWorkerService {
  constructor(
    @inject(PgBossService) private readonly _boss: PgBossService,
    @inject(JobHandlerRegistry) private readonly _registry: JobHandlerRegistry,
    @inject(JobRunTracker) private readonly _tracker: JobRunTracker,
    @inject(DataSource) private readonly _dataSource: DataSource,
    @inject(JobSignals) private readonly _signals: JobSignals,
    @inject(JobWorkerTracker) private readonly _workers: JobWorkerTracker,
    @inject(FileStorage) @optional() private readonly _storage?: FileStorage,
  ) {}

  /** Взять до `max` задач; без задач — ждать до `waitSeconds`. */
  async claim(
    caller: IWorkerCaller,
    body: IClaimJobsBody,
    signal?: AbortSignal,
  ): Promise<IClaimedJobDto[]> {
    const handlers = [...new Set(body.queues)].map(queue =>
      this.allowedHandler(caller, queue),
    );
    const max = body.max ?? 1;
    const waitMs =
      Math.min(body.waitSeconds ?? 0, WORKER_CLAIM_MAX_WAIT_SECONDS) * 1000;
    const deadline = Date.now() + waitMs;
    const boss = await this._boss.ready();

    await this._workers
      .seen(
        handlers.map(h => h.definition.queue),
        body.worker,
        caller.keyId ?? null,
      )
      .catch(err => logger.warn({ err }, "[Jobs] Отметка воркера не записана"));

    while (true) {
      const claimed: IClaimedJobDto[] = [];

      for (const handler of handlers) {
        if (claimed.length >= max) break;

        const jobs = await boss.fetch<unknown>(handler.definition.queue, {
          batchSize: max - claimed.length,
          includeMetadata: true,
        });

        for (const job of jobs) {
          const leased = await this.lease(handler, job);

          if (leased) claimed.push(leased);
        }
      }

      const left = deadline - Date.now();

      if (claimed.length || left <= 0 || signal?.aborted) return claimed;

      const queues = new Set(handlers.map(h => h.definition.queue));

      if (
        !(await this.waitForJobs(
          queues,
          Math.min(WORKER_CLAIM_POLL_MS, left),
          signal,
        ))
      ) {
        // Клиент отключился — задач он уже не получит.
        return [];
      }
    }
  }

  /** Статус внешних очередей: кто из воркеров на связи. */
  workersStatus(): Promise<IWorkerQueueStatusDto[]> {
    return this._workers.status(
      this._registry
        .all()
        .filter(handler => handler.definition.external)
        .map(handler => handler.definition.queue),
    );
  }

  async heartbeat(
    caller: IWorkerCaller,
    id: string,
    body: IHeartbeatJobBody,
  ): Promise<IHeartbeatResultDto> {
    const { run, handler } = await this.findRun(caller, id);

    if (!this.isHeld(run, body.attempt)) return { cancel: true, stop: false };

    const { leaseSeconds } = resolveDefinition(handler.definition);

    await this._tracker.update(run, {
      leaseUntil: secondsFromNow(leaseSeconds),
      ...(body.progress !== undefined && {
        progress: clampProgress(body.progress),
      }),
      ...(body.text !== undefined && { progressText: body.text }),
      ...(body.log !== undefined &&
        body.log.length > 0 && {
          logTail: appendLogTail(run.logTail, body.log),
        }),
    });

    // Повторно присланные события (ответ прошлого heartbeat потерялся) — мимо.
    const events = (body.events ?? []).filter(
      event => event.seq === undefined || event.seq > run.eventSeq,
    );

    if (events.length) {
      await this.deliverEvents(
        run,
        handler,
        events.map(({ type, data }) => ({ type, data })),
      );

      const lastSeq = Math.max(...events.map(event => event.seq ?? 0));

      if (lastSeq > run.eventSeq) {
        await this._tracker.update(run, { eventSeq: lastSeq });
      }
    }

    return { cancel: false, stop: run.stopRequested };
  }

  /**
   * Long-poll сигналов задачи: отвечает сразу, как только задачу отменили,
   * забрали у воркера или попросили остановить, иначе — через `waitSeconds`.
   * Будят сигналы NOTIFY, страхует редкая проверка записи.
   */
  async signal(
    caller: IWorkerCaller,
    id: string,
    body: ISignalJobBody,
    abort?: AbortSignal,
  ): Promise<IHeartbeatResultDto> {
    const first = await this.findRun(caller, id);
    const waitMs =
      Math.min(body.waitSeconds ?? 0, WORKER_SIGNAL_MAX_WAIT_SECONDS) * 1000;
    const verdict = (run: JobRun | null): IHeartbeatResultDto | null => {
      if (!run || !this.isHeld(run, body.attempt)) {
        return { cancel: true, stop: false };
      }

      return run.stopRequested ? { cancel: false, stop: true } : null;
    };
    const ready = verdict(first.run);

    if (ready || waitMs === 0 || abort?.aborted) {
      return ready ?? { cancel: false, stop: false };
    }

    return new Promise(resolve => {
      let done = false;
      let checking = false;
      const finish = (result: IHeartbeatResultDto) => {
        if (done) return;

        done = true;
        clearTimeout(deadline);
        clearInterval(poll);
        unsubscribe.forEach(fn => fn());
        abort?.removeEventListener("abort", onAbort);
        resolve(result);
      };
      const check = async () => {
        if (done || checking) return;

        checking = true;
        try {
          const result = verdict(await this._tracker.find(id));

          if (result) finish(result);
        } finally {
          checking = false;
        }
      };
      const onSignal = (payload: string) => {
        if (payload === id) void check();
      };
      const channels: TJobSignalChannel[] = [
        JOB_CANCEL_CHANNEL,
        JOB_STOP_CHANNEL,
        JOB_SETTLED_CHANNEL,
      ];
      const unsubscribe = channels.map(channel =>
        this._signals.on(channel, onSignal),
      );
      const onAbort = () => finish({ cancel: false, stop: false });
      const deadline = setTimeout(
        () => finish({ cancel: false, stop: false }),
        waitMs,
      );
      const poll = setInterval(() => void check(), WORKER_SIGNAL_POLL_MS);

      poll.unref();
      abort?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async complete(
    caller: IWorkerCaller,
    id: string,
    body: ICompleteJobBody,
  ): Promise<void> {
    const { run, handler } = await this.findRun(caller, id);

    if (!this.isHeld(run, body.attempt)) throw JobsError.LEASE_LOST();

    const boss = await this._boss.ready();
    const info = await this.jobInfo(run);
    const result = body.result ?? null;

    try {
      await requestContext.run({ requestId: `job:${run.queue}:${id}` }, () =>
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
            result,
          );

          const settled = await boss.complete(
            run.queue,
            id,
            toJobOutput(result) ?? null,
            { db: managerDb(manager) },
          );

          if (!(settled as { affected?: number }).affected) {
            throw JobsError.LEASE_LOST();
          }

          await this._tracker.complete(run, result, manager);
        }),
      );
    } catch (err) {
      if (isLeaseLost(err)) throw err;

      logger.error(
        { err, queue: run.queue, jobId: id },
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
    caller: IWorkerCaller,
    id: string,
    body: IFailJobBody,
  ): Promise<void> {
    const { run, handler } = await this.findRun(caller, id);

    if (!this.isHeld(run, body.attempt)) throw JobsError.LEASE_LOST();

    await this.settleFailure(run, handler, {
      code: body.code,
      message: body.message,
      retryable: body.retryable ?? true,
    });
  }

  /**
   * Пауза long-poll: до `ms` или до сигнала о новой задаче в одной из очередей.
   * `false` — клиент отключился.
   */
  private waitForJobs(
    queues: Set<string>,
    ms: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return new Promise(resolve => {
      const finish = (alive: boolean) => {
        clearTimeout(timer);
        unsubscribe();
        signal?.removeEventListener("abort", onAbort);
        resolve(alive);
      };
      const onAbort = () => finish(false);
      const timer = setTimeout(() => finish(true), ms);
      const unsubscribe = this._signals.on(JOB_AVAILABLE_CHANNEL, queue => {
        if (queues.has(queue)) finish(true);
      });

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** События воркера — хуку очереди по порядку; ошибка хука не прерывает задачу. */
  private async deliverEvents(
    run: JobRun,
    handler: TExternalHandler,
    events: ExternalJobEvent[],
  ): Promise<void> {
    if (!handler.onEvent) return;

    const info = await this.jobInfo(run);

    for (const event of events) {
      try {
        await requestContext.run(
          { requestId: `job:${run.queue}:${run.id}` },
          () => handler.onEvent!(info, event),
        );
      } catch (err) {
        logger.error(
          { err, jobId: run.id, event: event.type },
          "[Jobs] onEvent внешней задачи упал",
        );
      }
    }
  }

  /** Очередь внешняя и разрешена ключом. */
  private allowedHandler(
    caller: IWorkerCaller,
    queue: string,
  ): TExternalHandler {
    const handler = this._registry.external(queue);

    if (!handler) {
      throw this._registry.get(queue)
        ? JobsError.NOT_EXTERNAL({ queue })
        : JobsError.UNKNOWN_QUEUE({ queue });
    }
    if (!hasPermission(caller.scopes, workerScope(queue))) {
      throw JobsError.QUEUE_FORBIDDEN({ queue });
    }

    return handler;
  }

  private async findRun(
    caller: IWorkerCaller,
    id: string,
  ): Promise<{ run: JobRun; handler: TExternalHandler }> {
    const run = await this._tracker.find(id);

    if (!run) throw JobsError.NOT_FOUND();

    return { run, handler: this.allowedHandler(caller, run.queue) };
  }

  /** Задача всё ещё за этим воркером: выполняется, не отменена, та же попытка. */
  private isHeld(run: JobRun, attempt: number | undefined): boolean {
    return (
      run.status === EJobRunStatus.RUNNING &&
      !run.cancelRequested &&
      (attempt === undefined || attempt === run.attempt)
    );
  }

  /** Выдать задачу воркеру: аренда, файлы, подписанные ссылки. */
  private async lease(
    handler: TExternalHandler,
    job: JobWithMetadata<unknown>,
  ): Promise<IClaimedJobDto | null> {
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
      });

      if (!run || run.status !== EJobRunStatus.RUNNING) {
        // Отменили между выборкой и арендой — снять и в pg-boss.
        const boss = await this._boss.ready();

        await boss.cancel(queue, job.id);

        return null;
      }

      return {
        jobId: job.id,
        queue,
        data: job.data,
        attempt: info.attempt,
        leaseSeconds,
        ...(await this.signFiles(files)),
      };
    } catch (err) {
      logger.error(
        { err, queue, jobId: job.id },
        "[Jobs] Не удалось выдать задачу воркеру",
      );

      const boss = await this._boss.ready();

      await boss.fail(queue, job.id, {
        code: "CLAIM_FAILED",
        message: err instanceof Error ? err.message : String(err),
      });

      return null;
    }
  }

  private async signFiles(
    files: IJobRunFiles | null,
  ): Promise<
    Pick<IClaimedJobDto, "inputs" | "outputs" | "outputContentTypes">
  > {
    const inputs = Object.entries(files?.inputs ?? {});
    const outputs = Object.entries(files?.outputs ?? {});

    const outputContentTypes = Object.fromEntries(
      outputs.flatMap(([name, { contentType }]) =>
        contentType ? [[name, contentType]] : [],
      ),
    );

    if (!inputs.length && !outputs.length) {
      return { inputs: {}, outputs: {}, outputContentTypes };
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
            await storage.signedPutUrl(key, { contentType }),
          ]),
        ),
      ),
      outputContentTypes,
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
    failure: { code: string; message: string; retryable: boolean },
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
}
