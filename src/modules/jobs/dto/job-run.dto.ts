import { BaseDto } from "../../../core/dto/BaseDto";
import { JobRun } from "../job-run.entity";
import { EJobRunStatus, IJobRunError } from "../jobs.types";

/** Файл итога задачи: подписанная ссылка на скачивание (GET, срок — `expiresAt`). */
export interface IJobRunOutputDto {
  /** Имя выхода задачи (`result`). */
  name: string;
  url: string;
  /** Размер, байт; неизвестен — нет поля. */
  size?: number;
  /** Ссылка действует до. */
  expiresAt: Date;
}

export class JobRunDto extends BaseDto {
  /** Id задачи (совпадает с id pg-boss). */
  id: string;
  queue: string;
  status: EJobRunStatus;
  title: string;
  /** Прогресс 0..1. */
  progress: number;
  progressText: string | null;
  /** Последние строки лога. */
  logTail: string[];
  result: unknown;
  error: IJobRunError | null;
  ownerId: string | null;
  scopeType: string | null;
  scopeId: string | null;
  /** Номер попытки, с 0. */
  attempt: number;
  cancelRequested: boolean;
  /** Агент, у воркера которого выполняется внешняя задача. */
  agentId: string | null;
  /** Воркер агента, выполняющий внешнюю задачу. */
  worker: string | null;
  /** Тип задачи воркера внешней задачи (`echo.long`). */
  jobType: string | null;
  /** Файлы итога внешней задачи — ссылки на скачивание; нет файлов — `null`. */
  outputs: IJobRunOutputDto[] | null;
  /** Срок внешней задачи. */
  deadlineAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;

  constructor(entity: JobRun, outputs: IJobRunOutputDto[] | null = null) {
    super(entity);

    this.id = entity.id;
    this.queue = entity.queue;
    this.status = entity.status;
    this.title = entity.title;
    this.progress = entity.progress;
    this.progressText = entity.progressText;
    this.logTail = entity.logTail;
    this.result = entity.result ?? null;
    this.error = entity.error;
    this.ownerId = entity.ownerId;
    this.scopeType = entity.scopeType;
    this.scopeId = entity.scopeId;
    this.attempt = entity.attempt;
    this.cancelRequested = entity.cancelRequested;
    this.agentId = entity.agentId;
    this.worker = entity.worker;
    this.jobType = entity.jobType;
    this.outputs = outputs;
    this.deadlineAt = entity.deadlineAt;
    this.startedAt = entity.startedAt;
    this.finishedAt = entity.finishedAt;
    this.createdAt = entity.createdAt;
  }

  /** DTO без ссылок на файлы итога; со ссылками — `JobRunViews`. */
  static fromEntity(
    entity: JobRun,
    outputs: IJobRunOutputDto[] | null = null,
  ): JobRunDto {
    return new JobRunDto(entity, outputs);
  }
}
