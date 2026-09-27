import {
  ExternalJobContext,
  ExternalJobFiles,
  ExternalJobInfo,
  IExternalJobHandler,
  Injectable,
  JobDefinition,
  logger,
} from "../../core";

/** Очередь демо-воркера (`python/examples/echo_worker.py`). */
export const DEMO_ECHO_QUEUE = "demo.echo";

export interface IDemoEchoData {
  text: string;
  /** Отдать воркеру файлы: входной — ключ хранилища, выход — `jobs/<id>/echo.txt`. */
  inputKey?: string;
  withOutput?: boolean;
}

export interface IDemoEchoResult {
  echo: string;
}

/**
 * Эталон внешней очереди: воркер на любом языке возвращает текст обратно.
 * Проверка протокола и e2e-тест SDK воркера.
 */
@Injectable()
export class DemoEchoJobHandler implements IExternalJobHandler<
  IDemoEchoData,
  IDemoEchoResult
> {
  readonly definition: JobDefinition & { external: true } = {
    queue: DEMO_ECHO_QUEUE,
    external: true,
    retryLimit: 2,
    retryDelaySeconds: 5,
    leaseSeconds: 30,
    expireInSeconds: 600,
  };

  io(job: ExternalJobInfo<IDemoEchoData>): ExternalJobFiles {
    return {
      ...(job.data.inputKey && { inputs: { source: job.data.inputKey } }),
      ...(job.data.withOutput && {
        outputs: {
          echo: { key: `jobs/${job.id}/echo.txt`, contentType: "text/plain" },
        },
      }),
    };
  }

  async onComplete(
    ctx: ExternalJobContext<IDemoEchoData>,
    result: IDemoEchoResult,
  ): Promise<void> {
    logger.info(
      { jobId: ctx.id, echo: result?.echo, outputs: ctx.outputs },
      "[Jobs] demo.echo выполнена",
    );
  }
}
