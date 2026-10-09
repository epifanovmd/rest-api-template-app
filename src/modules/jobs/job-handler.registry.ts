import { config } from "../../config";
import {
  AnyJobHandler,
  IExternalJobHandler,
  IJobHandler,
  Injectable,
  InternalServerErrorException,
  isExternalJobHandler,
  JobDefinition,
} from "../../core";
import { JOB_MAX_EXPIRE_SECONDS } from "./jobs.types";

/** Определение очереди с умолчаниями. */
export type TResolvedJobDefinition = Required<
  Pick<
    JobDefinition,
    | "queue"
    | "retryLimit"
    | "retryDelaySeconds"
    | "retryBackoff"
    | "expireInSeconds"
    | "concurrency"
    | "tracked"
    | "external"
  >
> &
  Pick<JobDefinition, "cron" | "job">;

export const resolveDefinition = (
  definition: JobDefinition,
): TResolvedJobDefinition => ({
  queue: definition.queue,
  retryLimit: definition.retryLimit ?? 3,
  retryDelaySeconds: definition.retryDelaySeconds ?? 10,
  retryBackoff: definition.retryBackoff ?? true,
  expireInSeconds: definition.expireInSeconds ?? 900,
  concurrency: definition.concurrency ?? config.jobs.concurrency,
  cron: definition.cron,
  // Внешняя задача без записи не может держать аренду и получать отмену.
  tracked: definition.tracked === true || definition.external === true,
  external: definition.external === true,
  ...(definition.job && { job: { ...definition.job } }),
});

/**
 * Обработчики очередей по имени. Заполняется бутстрапером из `JOB_HANDLER`,
 * а не инъекцией: обработчики сами зависят от `JobQueue` (ставят задачи),
 * и прямая зависимость очереди от них была бы циклом.
 */
@Injectable()
export class JobHandlerRegistry {
  private readonly _handlers = new Map<string, AnyJobHandler>();

  register(handlers: AnyJobHandler[]): void {
    for (const handler of handlers) {
      const { queue } = handler.definition;

      if (this._handlers.has(queue)) {
        throw new InternalServerErrorException(
          `Очередь «${queue}» зарегистрирована дважды`,
        );
      }

      const { expireInSeconds, external, job } = resolveDefinition(
        handler.definition,
      );

      if (external && !job?.type) {
        throw new InternalServerErrorException(
          `Очередь «${queue}»: внешней очереди нужен тип задачи воркера (job.type)`,
        );
      }

      // pg-boss отвергает больше суток уже при старте — объясняем сразу.
      if (expireInSeconds > JOB_MAX_EXPIRE_SECONDS) {
        throw new InternalServerErrorException(
          `Очередь «${queue}»: expireInSeconds больше суток (${JOB_MAX_EXPIRE_SECONDS})`,
        );
      }

      this._handlers.set(queue, handler);
    }
  }

  all(): AnyJobHandler[] {
    return [...this._handlers.values()];
  }

  get(queue: string): AnyJobHandler | undefined {
    return this._handlers.get(queue);
  }

  /** Очереди, которые выполняет Node-процесс. */
  internal(): IJobHandler<unknown, unknown>[] {
    return this.all().filter(
      (handler): handler is IJobHandler<unknown, unknown> =>
        !isExternalJobHandler(handler),
    );
  }

  external(queue: string): IExternalJobHandler<unknown, unknown> | undefined {
    const handler = this._handlers.get(queue);

    return handler && isExternalJobHandler(handler) ? handler : undefined;
  }

  definition(queue: string): TResolvedJobDefinition | undefined {
    const handler = this._handlers.get(queue);

    return handler && resolveDefinition(handler.definition);
  }
}
