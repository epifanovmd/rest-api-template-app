import type { IFileDto } from "./file.dto";
import type { File } from "./file.entity";

/** Подписанные DTO файлов по id — карта, из которой DTO модулей берут ссылки. */
export type TSignedFiles = ReadonlyMap<string, IFileDto>;

/** Ссылка на файл в сущности: связь может быть не загружена или пуста. */
export type TFileRef = File | null | undefined;

/** Пустая карта: DTO без файлов или без подписи — ссылки `null`. */
export const NO_SIGNED_FILES: TSignedFiles = new Map();

/** Подписанный DTO файла из карты; нет файла или подписи — `undefined`. */
export const signedFileOf = (
  file: TFileRef,
  files: TSignedFiles,
): IFileDto | undefined => (file ? files.get(file.id) : undefined);

/** Подписанная ссылка показа из карты; нет файла или подписи — `null`. */
export const signedUrlOf = (
  file: TFileRef,
  files: TSignedFiles,
): string | null => signedFileOf(file, files)?.url ?? null;
