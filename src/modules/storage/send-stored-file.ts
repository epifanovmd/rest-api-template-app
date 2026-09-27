import type { Context } from "koa";

import type { FileStorage } from "../../core";
import { parseRange } from "./http-range";
import { StorageError } from "./storage.errors";

export type TContentDisposition = "inline" | "attachment" | "auto";

export interface ISendStoredFileOptions {
  /**
   * `auto` — медиа (изображения кроме SVG, видео, аудио) inline, остальное
   * вложением, чтобы браузер не исполнял содержимое в контексте API.
   */
  disposition?: TContentDisposition;
  /** Имя в `Content-Disposition`. */
  fileName?: string;
  /** По умолчанию `private, max-age=0`. */
  cacheControl?: string;
  /** Тип вместо сохранённого в хранилище. */
  contentType?: string;
}

const FALLBACK_TYPE = "application/octet-stream";

export const isInlineContentType = (contentType: string): boolean =>
  /^(image|video|audio)\//.test(contentType) &&
  !contentType.startsWith("image/svg");

const dispositionHeader = (
  disposition: TContentDisposition,
  contentType: string,
  fileName?: string,
) => {
  const type =
    disposition === "auto"
      ? isInlineContentType(contentType)
        ? "inline"
        : "attachment"
      : disposition;

  return fileName
    ? `${type}; filename*=UTF-8''${encodeURIComponent(fileName)}`
    : type;
};

const etagMatches = (header: string | undefined, etag: string) =>
  !!header &&
  (header.trim() === "*" ||
    header
      .split(",")
      .map(tag => tag.trim().replace(/^W\//, ""))
      .includes(etag.replace(/^W\//, "")));

/**
 * Отдать объект хранилища в ответ Koa: `Range` → 206/416, `If-None-Match`
 * → 304, `ETag`, `Last-Modified`, `nosniff`, `Content-Disposition`. HEAD —
 * без чтения объекта. Авторизацию проверяет вызывающий.
 */
export const sendStoredFile = async (
  ctx: Context,
  storage: FileStorage,
  key: string,
  options: ISendStoredFileOptions = {},
): Promise<void> => {
  const stored = await storage.stat(key);

  if (!stored) throw StorageError.NOT_FOUND();

  const contentType =
    options.contentType ?? stored.contentType ?? FALLBACK_TYPE;

  ctx.set("Accept-Ranges", "bytes");
  ctx.set("Cache-Control", options.cacheControl ?? "private, max-age=0");
  ctx.set("X-Content-Type-Options", "nosniff");
  ctx.set(
    "Content-Disposition",
    dispositionHeader(
      options.disposition ?? "auto",
      contentType,
      options.fileName,
    ),
  );
  if (stored.etag) ctx.set("ETag", stored.etag);
  if (stored.lastModified)
    ctx.set("Last-Modified", stored.lastModified.toUTCString());

  if (stored.etag && etagMatches(ctx.get("If-None-Match"), stored.etag)) {
    ctx.status = 304;

    return;
  }

  const ifRange = ctx.get("If-Range");
  const range =
    !ifRange || ifRange === stored.etag
      ? parseRange(ctx.get("Range") || undefined, stored.size)
      : null;

  if (range === "unsatisfiable") {
    ctx.set("Content-Range", `bytes */${stored.size}`);
    throw StorageError.RANGE_NOT_SATISFIABLE();
  }

  ctx.status = range ? 206 : 200;
  ctx.type = contentType;

  if (range) {
    ctx.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${stored.size}`,
    );
  }

  const length = range ? range.end - range.start + 1 : stored.size;

  if (ctx.method !== "HEAD") {
    ctx.body = await storage.get(key, range ?? undefined);
  }

  ctx.length = length;
};
