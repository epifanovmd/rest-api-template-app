/** Каталоги и файлы, которые архиваторы добавляют сами: `__MACOSX`, `.DS_Store`, `.git`. */
export const isServiceEntry = (name: string): boolean =>
  name
    .split("/")
    .some(segment => segment === "__MACOSX" || segment.startsWith("."));

/**
 * Имя записи безопасно для распаковки: относительное, без `..`, пустых
 * сегментов, `\`, NUL и буквы диска.
 */
export const isSafeEntryName = (name: string): boolean => {
  if (!name || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return false;
  if (name.includes("\\") || name.includes("\0")) return false;

  const segments = (name.endsWith("/") ? name.slice(0, -1) : name).split("/");

  return segments.every(segment => segment !== "" && segment !== "..");
};
