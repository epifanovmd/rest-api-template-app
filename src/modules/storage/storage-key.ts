import { StorageError } from "./storage.errors";

const MAX_KEY_LENGTH = 1024;

/**
 * Сегменты ключа. Ключ — относительный путь из `/`-сегментов без `.`/`..`,
 * пустых и скрытых сегментов (скрытые каталоги корня служебные), без `\` и NUL.
 * Иначе — `STORAGE_INVALID_KEY`.
 */
export const keySegments = (key: string): string[] => {
  if (!key || key.length > MAX_KEY_LENGTH) throw StorageError.INVALID_KEY();

  const segments = key.split("/");
  const isValid = segments.every(
    segment =>
      segment.length > 0 &&
      !segment.startsWith(".") &&
      !segment.includes("\\") &&
      !segment.includes("\0"),
  );

  if (!isValid) throw StorageError.INVALID_KEY();

  return segments;
};

/** Проверенный ключ как есть. */
export const assertValidKey = (key: string): string => {
  keySegments(key);

  return key;
};

/**
 * Префикс для `deletePrefix`: непустой, из допустимых сегментов; может
 * заканчиваться на `/` (папка) или на часть имени.
 */
export const prefixSegments = (prefix: string): string[] =>
  keySegments(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);

/** Ключ в пути URL: каждый сегмент кодируется отдельно. */
export const encodeKeyPath = (key: string): string =>
  keySegments(key).map(encodeURIComponent).join("/");

/** Ключ из пути URL; битое кодирование — `STORAGE_INVALID_KEY`. */
export const decodeKeyPath = (encoded: string): string => {
  try {
    return assertValidKey(encoded.split("/").map(decodeURIComponent).join("/"));
  } catch {
    throw StorageError.INVALID_KEY();
  }
};
