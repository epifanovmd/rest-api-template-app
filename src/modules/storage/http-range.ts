export interface IByteRange {
  start: number;
  /** Включительно. */
  end: number;
}

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;

/**
 * Разбор заголовка `Range` для объекта размера `size`: один диапазон
 * байт. `null` — заголовка нет, он некорректен или диапазонов несколько
 * (отдаётся файл целиком); `"unsatisfiable"` — 416.
 */
export const parseRange = (
  header: string | undefined,
  size: number,
): IByteRange | "unsatisfiable" | null => {
  const match = header ? RANGE_RE.exec(header.trim()) : null;

  if (!match) return null;

  const [, startRaw, endRaw] = match;

  if (startRaw === "" && endRaw === "") return null;

  if (startRaw === "") {
    const suffix = Number(endRaw);

    if (suffix === 0 || size === 0) return "unsatisfiable";

    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(startRaw);
  const end = endRaw === "" ? size - 1 : Number(endRaw);

  if (start >= size) return "unsatisfiable";
  if (end < start) return null;

  return { start, end: Math.min(end, size - 1) };
};
