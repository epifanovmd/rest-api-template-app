/** Запрос задач внешним воркером. */
export interface IClaimJobsBody {
  /** Очереди, из которых воркер готов брать задачи. */
  queues: string[];
  /** Сколько задач взять за раз (1..10, по умолчанию 1). */
  max?: number;
  /** Long-poll: сколько ждать задач, если их нет (0..25 с). */
  waitSeconds?: number;
  /** Кто берёт задачи — для статуса воркеров. */
  worker?: IWorkerInfoBody;
}

/** Представление воркера. */
export interface IWorkerInfoBody {
  /** Имя экземпляра: хост и pid. */
  name: string;
  /** Сведения о воркере: версия SDK, устройство (строки). */
  meta?: Record<string, string>;
}

/** Воркер очереди в статусе. */
export interface IWorkerInstanceDto {
  name: string;
  lastSeenAt: Date;
  meta: Record<string, string>;
}

/** Внешняя очередь: есть ли воркеры на связи. */
export interface IWorkerQueueStatusDto {
  queue: string;
  /** Хотя бы один воркер брал задачи в последние 90 с. */
  online: boolean;
  workers: IWorkerInstanceDto[];
}

/** Задача, выданная воркеру. */
export interface IClaimedJobDto {
  jobId: string;
  queue: string;
  data: unknown;
  /** Номер попытки, с 0: вернуть в heartbeat/complete/fail. */
  attempt: number;
  /** Heartbeat нужен чаще, чем раз в этот срок. */
  leaseSeconds: number;
  /** Подписанные ссылки на чтение входных файлов. */
  inputs: Record<string, string>;
  /** Подписанные ссылки на загрузку результатов (PUT). */
  outputs: Record<string, string>;
  /**
   * Content-Type, с которым подписана ссылка выхода: PUT обязан отправить
   * ровно его (иначе S3 отклонит подпись).
   */
  outputContentTypes: Record<string, string>;
}

export interface IHeartbeatJobBody {
  attempt?: number;
  /** Прогресс 0..1. */
  progress?: number;
  text?: string;
  /** Новые строки лога. */
  log?: string[];
  /** События для хука очереди (`onEvent`): метрики эпохи и т. п. */
  events?: IWorkerEventBody[];
}

/** Событие воркера. */
export interface IWorkerEventBody {
  /**
   * Номер события в попытке (1, 2, …): повторно присланные сервер отбрасывает.
   * Без номера событие принимается всегда.
   */
  seq?: number;
  /** Тип события в пределах очереди: `epoch`. */
  type: string;
  data?: unknown;
}

/** Ожидание сигнала задачи: отменить или остановить. */
export interface ISignalJobBody {
  attempt?: number;
  /** Сколько ждать сигнала, секунд (0–25); без сигнала — `{ cancel: false, stop: false }`. */
  waitSeconds?: number;
}

export interface IHeartbeatResultDto {
  /** Задачу отменили или аренда потеряна — прекратить работу. */
  cancel: boolean;
  /**
   * Попросили завершить досрочно, но штатно: довести шаг и сдать результат
   * через complete.
   */
  stop: boolean;
}

export interface ICompleteJobBody {
  attempt?: number;
  /** Результат задачи (JSON). */
  result?: unknown;
}

export interface IFailJobBody {
  attempt?: number;
  /** Машинный код ошибки: `MODEL_NOT_FOUND`. */
  code: string;
  message: string;
  /** Повторять ли задачу (по умолчанию true). */
  retryable?: boolean;
}
