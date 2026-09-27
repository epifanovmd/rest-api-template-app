/** Состояние файла. */
export enum EFileStatus {
  /** Прямая загрузка выдана, объект ещё не подтверждён (`complete`). */
  Pending = "pending",
  /** Оригинал сохранён, производные (webp, превью, waveform) готовятся. */
  Processing = "processing",
  Ready = "ready",
  /** Обработка не удалась; оригинал доступен, производных нет. */
  Failed = "failed",
}

/** Очереди задач модуля. */
export const FileQueues = {
  process: "file.process",
  cleanupPending: "file.cleanup-pending",
  remove: "file.remove",
  gc: "file.gc",
} as const;

export interface IFileProcessJobData {
  fileId: string;
}

export interface IFileRemoveJobData {
  fileIds: string[];
}

/** Файлов в одной задаче удаления. */
export const FILE_REMOVE_CHUNK = 500;
/** Файлов за проход сборщика мусора. */
export const FILE_GC_BATCH = 1_000;
/**
 * Бесхозный файл моложе этого не собирается: транзакция, которая создаёт на
 * него ссылку, могла ещё не закоммититься.
 */
export const FILE_GC_GRACE_MS = 60 * 60 * 1000;

/** Предел прямой загрузки (`POST /file/uploads`), байт. */
export const DIRECT_UPLOAD_MAX_BYTES = 2 * 1024 ** 3;
/** Срок подписанной ссылки на загрузку, секунд. */
export const DIRECT_UPLOAD_URL_TTL_SECONDS = 60 * 60;
/** Через сколько неподтверждённая загрузка удаляется, мс. */
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
