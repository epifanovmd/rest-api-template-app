import { inject } from "inversify";

import { Injectable, logger } from "../../core";
import {
  AgentSessionHub,
  IAgentCapability,
  IAgentMessage,
  IAgentSession,
  IAlpStatus,
} from "../agent";
import {
  ExternalJobService,
  IAgentJobEvent,
  IAgentJobFailure,
  IAgentJobProgress,
  IAgentJobRef,
} from "./external-job.service";
import { JobRunTracker } from "./job-run.tracker";
import { JobSignals } from "./job-signals";
import {
  JOB_AVAILABLE_CHANNEL,
  JOB_CANCEL_CHANNEL,
  JOB_STOP_CHANNEL,
} from "./jobs.types";

/**
 * Выданная задача, которую агент ещё не принял (`job.accept`): её слот в
 * `status` агента может быть ещё не учтён.
 */
interface IPendingAssign {
  queue: string;
  assignedAt: number;
}

/**
 * Выданная задача не появилась в `status` за это время — больше не занимает
 * слот в расчёте (агент её не получил; сверка при переподключении её вернёт).
 */
const PENDING_ASSIGN_TTL_MS = 60_000;

/** Состояния агента, в которых он задачи не берёт. */
const NOT_ACCEPTING = new Set<IAlpStatus["state"]>([
  "starting",
  "draining",
  "updating",
]);

/**
 * Возможность `jobs`: внешние задачи раздаются агентам сами (push) по
 * свободным слотам из `status`. Поводы раздать — новый `status` (заодно
 * страховка от пропущенного сигнала) и сигнал о новой задаче очереди.
 * Пульс агента продлевает аренды его задач; отмена и остановка доходят
 * сигналом до процесса, где живёт сессия агента.
 */
@Injectable()
export class JobsAgentCapability implements IAgentCapability {
  readonly handles = [
    "job.accept",
    "job.progress",
    "job.reject",
    "job.event",
    "job.urls",
    "job.complete",
    "job.fail",
  ] as const;

  private readonly _pending = new WeakMap<
    IAgentSession,
    Map<string, IPendingAssign>
  >();
  private readonly _dispatching = new WeakMap<IAgentSession, Promise<void>>();

  constructor(
    @inject(ExternalJobService) private readonly _jobs: ExternalJobService,
    @inject(JobRunTracker) private readonly _tracker: JobRunTracker,
    @inject(AgentSessionHub) private readonly _hub: AgentSessionHub,
    @inject(JobSignals) signals: JobSignals,
  ) {
    signals.on(JOB_AVAILABLE_CHANNEL, queue => this._onAvailable(queue));
    signals.on(JOB_CANCEL_CHANNEL, id => void this._forward(id, "job.cancel"));
    signals.on(JOB_STOP_CHANNEL, id => void this._forward(id, "job.stop"));
  }

  async onOpen(session: IAgentSession): Promise<void> {
    if (!session.supports("jobs")) return;

    const pending = new Map<string, IPendingAssign>();

    this._pending.set(session, pending);

    const { resend, cancel, stop } = await this._jobs.reconcile(
      session.agentId,
      session.hello.jobs,
    );

    for (const assign of resend) {
      pending.set(assign.jobId, {
        queue: assign.queue,
        assignedAt: Date.now(),
      });
      session.send("job.assign", assign);
    }
    cancel.forEach(ref => session.send("job.cancel", ref));
    stop.forEach(ref => session.send("job.stop", ref));
  }

  /** Восстановленная сессия: без сверки по прежнему hello — только раздача. */
  async onResume(session: IAgentSession): Promise<void> {
    if (!session.supports("jobs")) return;

    this._pending.set(session, new Map());
    this._dispatch(session);
  }

  async onStatus(session: IAgentSession, status: IAlpStatus): Promise<void> {
    if (!session.supports("jobs")) return;

    await this._jobs.extendLeases(session.agentId, status.jobs);

    const pending = this._pending.get(session);

    status.jobs.forEach(job => pending?.delete(job.jobId));
    this._dispatch(session);
  }

  async deliver(session: IAgentSession): Promise<void> {
    this._dispatch(session);
  }

  async onMessage(
    session: IAgentSession,
    message: IAgentMessage,
  ): Promise<void> {
    const { agentId } = session;
    const ref = message.data as IAgentJobRef;

    switch (message.type) {
      case "job.accept":
        // Принятая задача дальше учтена в слотах status агента.
        this._pending.get(session)?.delete(ref.jobId);

        return this._jobs.accept(agentId, ref);
      case "job.progress":
        return this._jobs.progress(agentId, message.data as IAgentJobProgress);
      case "job.event":
        return this._jobs.event(agentId, message.data as IAgentJobEvent);
      case "job.urls": {
        const request = message.data as IAgentJobRef & {
          inputs?: string[];
          outputs?: string[];
        };

        session.send(
          "job.urls",
          await this._jobs.urls(agentId, ref, request),
          message.id,
        );

        return;
      }
      case "job.complete":
        this._pending.get(session)?.delete(ref.jobId);

        return this._jobs.complete(
          agentId,
          ref,
          (message.data as { result?: unknown }).result,
        );
      case "job.fail":
        this._pending.get(session)?.delete(ref.jobId);

        return this._jobs.fail(agentId, ref, message.data as IAgentJobFailure);
      case "job.reject":
        this._pending.get(session)?.delete(ref.jobId);

        return this._jobs.reject(
          agentId,
          ref,
          message.data as { code: string; message: string },
        );
    }
  }

  /** Раздача задач сессии — строго одна за раз на сессию. */
  private _dispatch(session: IAgentSession): void {
    const previous = this._dispatching.get(session) ?? Promise.resolve();
    const next = previous
      .then(() => this._fill(session))
      .catch(err =>
        logger.error(
          { err, agentId: session.agentId },
          "[Jobs] Раздача задач агенту",
        ),
      );

    this._dispatching.set(session, next);
  }

  /** Заполнить свободные слоты агента задачами его очередей. */
  private async _fill(session: IAgentSession): Promise<void> {
    const { status } = session;
    const pending = this._pending.get(session);

    if (session.closed || !status || !pending) return;
    if (NOT_ACCEPTING.has(status.state)) return;

    const now = Date.now();

    for (const [jobId, assign] of pending) {
      if (now - assign.assignedAt > PENDING_ASSIGN_TTL_MS)
        pending.delete(jobId);
    }

    // Очереди — из слотов последнего status: нагрузки агента регистрируются
    // и перезапускаются после hello, слоты всегда актуальны.
    for (const queue of Object.keys(status.slots)) {
      const inFlight = [...pending.values()].filter(
        assign => assign.queue === queue,
      ).length;
      const free = (status.slots[queue] ?? 0) - inFlight;

      if (free <= 0) continue;

      for (const assign of await this._jobs.take(
        queue,
        free,
        session.agentId,
      )) {
        if (session.closed) return;

        pending.set(assign.jobId, { queue, assignedAt: Date.now() });
        session.send("job.assign", assign);
      }
    }
  }

  private _onAvailable(queue: string): void {
    this._hub.each(session => {
      if (session.ready && (session.status?.slots[queue] ?? 0) > 0) {
        this._dispatch(session);
      }
    });
  }

  /** Отмена или остановка задачи — агенту, если его сессия в этом процессе. */
  private async _forward(
    jobId: string,
    type: "job.cancel" | "job.stop",
  ): Promise<void> {
    try {
      const run = await this._tracker.find(jobId);
      const session = run?.agentId ? this._hub.get(run.agentId) : undefined;

      if (run && session) {
        if (type === "job.cancel") this._pending.get(session)?.delete(run.id);
        session.send(type, { jobId: run.id, attempt: run.attempt });
      }
    } catch (err) {
      logger.warn({ err, jobId }, "[Jobs] Сигнал задачи агенту не доставлен");
    }
  }
}
