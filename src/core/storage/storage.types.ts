import type { Readable } from "stream";

/** Путь раздачи и приёма файлов по подписанным ссылкам. */
export const STORAGE_ROUTE_PREFIX = "/files";

export interface StoredObject {
  size: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

export interface PutOptions {
  contentType?: string;
  /** Как отдавать при скачивании: inline (просмотр) или attachment (файл). */
  contentDisposition?: string;
}

export interface SignedUrlOptions {
  /** Срок ссылки, секунд; по умолчанию `STORAGE_SIGNED_URL_TTL_SECONDS`. */
  ttlSeconds?: number;
  /** Скачать под этим именем (attachment). */
  downloadName?: string;
}

/** Тело для записи: буфер, поток или путь к локальному файлу. */
export type StorageBody = Buffer | Readable | { path: string };

/**
 * Хранилище файлов по ключам (`files/<id>.webp`, `exports/<id>/…`).
 * Раскладку ключей определяет домен, ядро знает только ключи. Реализации —
 * модуль `storage`: диск (dev) и S3-совместимое хранилище.
 * Абстрактный класс служит DI-токеном: `@inject(FileStorage)`.
 */
export abstract class FileStorage {
  abstract put(
    key: string,
    body: StorageBody,
    options?: PutOptions,
  ): Promise<StoredObject>;
  abstract get(
    key: string,
    range?: { start: number; end?: number },
  ): Promise<Readable>;
  /** `null` — объекта нет. */
  abstract stat(key: string): Promise<StoredObject | null>;
  abstract delete(key: string): Promise<void>;
  /** Удалить все объекты с префиксом (папку сущности). */
  abstract deletePrefix(prefix: string): Promise<void>;
  /** Подписанная ссылка на чтение: для `<img>`, скачивания, агентов. */
  abstract signedGetUrl(
    key: string,
    options?: SignedUrlOptions,
  ): Promise<string>;
  /** Подписанная ссылка на запись: прямая загрузка клиентом или воркером. */
  abstract signedPutUrl(
    key: string,
    options?: SignedUrlOptions & {
      contentType?: string;
      /** Точный размер тела: хранилище отклонит другой. */
      contentLength?: number;
    },
  ): Promise<string>;
  /**
   * Выполнить `fn` с локальным путём к объекту (sharp, ffmpeg, архивы требуют
   * файл): для S3 — временная копия, удаляемая после `fn`.
   */
  abstract withLocalFile<R>(
    key: string,
    fn: (path: string) => Promise<R>,
  ): Promise<R>;
}
