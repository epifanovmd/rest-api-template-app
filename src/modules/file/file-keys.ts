import { randomUUID } from "crypto";
import path from "path";

/** Производная версия файла в хранилище. */
export type TFileVariant = "optimized" | "thumbnail" | "medium";

/** Папка всех объектов файла: удаляется целиком. */
export const filePrefix = (fileId: string): string => `files/${fileId}/`;

/** Ключ оригинала: расширение из имени (только `[a-z0-9]`), имя — служебное. */
export const originalKey = (fileId: string, fileName: string): string => {
  const ext = path
    .extname(fileName)
    .slice(1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return `${filePrefix(fileId)}original${ext ? `.${ext}` : ""}`;
};

export const variantKey = (
  fileId: string,
  variant: TFileVariant,
  ext: string,
): string => `${filePrefix(fileId)}${variant}.${ext}`;

/**
 * Id и ключ будущего файла, объект которого загрузит кто-то другой (выход
 * внешнего воркера по подписанной ссылке); потом — `FileService.registerStored`.
 */
export const reserveFileKey = (
  fileName: string,
): { fileId: string; key: string } => {
  const fileId = randomUUID();

  return { fileId, key: originalKey(fileId, fileName) };
};
