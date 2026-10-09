import {
  ExternalJobContext,
  ExternalJobFiles,
  ExternalJobInfo,
  IExternalJobHandler,
  Injectable,
  JobDefinition,
  logger,
} from "../../core";

/** Очередь демо-воркера агента `echo` (`agent/workers/echo`). */
export const DEMO_ECHO_QUEUE = "demo.echo";

/** Типы задач воркера `echo`: быстрая (итог сразу) и долгая (ход событиями). */
export const DEMO_ECHO_JOB_TYPES = {
  quick: "echo.quick",
  long: "echo.long",
} as const;

export interface IDemoEchoData {
  text: string;
  /**
   * Быстрая задача берёт префикс у сервера: воркер шлёт запрос `echo.lookup`
   * (`DemoEchoLookupHandler`).
   */
  lookup?: boolean;
  /** Долгая задача `echo.long`: шаги с событиями хода; иначе — `echo.quick`. */
  long?: boolean;
  /** Шагов долгой задачи (по умолчанию 5). */
  steps?: number;
  /** Пауза шага, мс (по умолчанию 500). */
  delayMs?: number;
  /** Долгая задача падает после шагов — `job.failed`. */
  fail?: boolean;
  /** Долгая задача записывает итог в файл `jobs/<id>/echo.txt` (по подписанной ссылке). */
  withOutput?: boolean;
}

export interface IDemoEchoResult {
  text: string;
  /** Префикс от сервера (`lookup`). */
  prefix?: string;
  /** Имя выходного файла, если итог записан в файл. */
  output?: string;
}

/** Ключ выходного файла демо-задачи в хранилище. */
export const demoEchoOutputKey = (jobId: string): string =>
  `jobs/${jobId}/echo.txt`;

/**
 * Эталон внешней очереди: воркер `echo` агента выполняет задачу своего типа —
 * `echo.quick` (итог в ответе; с `lookup` — префикс по запросу воркера к
 * серверу) или `echo.long` (`202`, ход и итог событиями, отмена, файл итога
 * по подписанной ссылке) — и возвращает текст по своим настройкам (префикс,
 * регистр). Проверка агентов, воркеров и путей отказа.
 */
@Injectable()
export class DemoEchoJobHandler implements IExternalJobHandler<
  IDemoEchoData,
  IDemoEchoResult
> {
  readonly definition: JobDefinition & {
    external: true;
    job: { type: string; worker: string };
  } = {
    queue: DEMO_ECHO_QUEUE,
    external: true,
    job: { type: DEMO_ECHO_JOB_TYPES.quick, worker: "echo" },
    retryLimit: 5,
    retryDelaySeconds: 5,
    retryBackoff: false,
    expireInSeconds: 600,
  };

  jobType(job: ExternalJobInfo<IDemoEchoData>): string {
    return job.data.long ? DEMO_ECHO_JOB_TYPES.long : DEMO_ECHO_JOB_TYPES.quick;
  }

  io(job: ExternalJobInfo<IDemoEchoData>): ExternalJobFiles {
    if (!job.data.long || !job.data.withOutput) return {};

    // Тип подписывается: воркер загружает файл ровно с этим Content-Type.
    return {
      outputs: {
        result: { key: demoEchoOutputKey(job.id), contentType: "text/plain" },
      },
    };
  }

  async onComplete(
    ctx: ExternalJobContext<IDemoEchoData>,
    result: IDemoEchoResult,
  ): Promise<void> {
    logger.info(
      { jobId: ctx.id, text: result?.text, outputs: ctx.outputs },
      "[Jobs] demo.echo выполнена",
    );
  }
}
