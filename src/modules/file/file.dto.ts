import type { EFileStatus } from "./file.types";

export interface IFileDto {
  id: string;
  ownerId: string | null;
  name: string;
  type: string;
  size: number;
  status: EFileStatus;
  /**
   * Подписанная ссылка для показа: оптимизированная версия, если готова,
   * иначе оригинал. `null` — прямая загрузка не завершена. Срок ограничен.
   */
  url: string | null;
  /** Подписанная ссылка на скачивание оригинала под исходным именем. */
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  mediumUrl: string | null;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  waveform: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Запрос прямой загрузки. */
export interface ICreateUploadBody {
  /** Исходное имя файла (с расширением из белого списка). */
  name: string;
  /** Точный размер, байт. */
  size: number;
  /** MIME-тип; должен соответствовать расширению. */
  contentType: string;
}

/** Выданная прямая загрузка: `PUT uploadUrl` с заголовками `headers`, затем `complete`. */
export interface IDirectUploadDto {
  fileId: string;
  uploadUrl: string;
  /** Заголовки, обязательные для `PUT` (входят в подпись). */
  headers: Record<string, string>;
  expiresAt: Date;
}
