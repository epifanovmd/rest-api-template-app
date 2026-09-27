export type TArchiveErrorCode =
  | "ARCHIVE_INVALID"
  | "ARCHIVE_TOO_LARGE"
  | "ARCHIVE_TOO_MANY_ENTRIES"
  | "ARCHIVE_ENTRY_TOO_LARGE"
  | "ARCHIVE_COMPRESSION_RATIO"
  | "ARCHIVE_UNSAFE_NAME";

/**
 * Ошибка разбора или сборки архива с машинным кодом. `common` не знает о
 * HTTP: вызывающий модуль переводит её в свою доменную ошибку.
 */
export class ArchiveError extends Error {
  constructor(
    public readonly code: TArchiveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArchiveError";
  }
}
