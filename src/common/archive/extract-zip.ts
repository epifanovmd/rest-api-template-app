import { createWriteStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import yauzl from "yauzl";

import { ArchiveError } from "./archive.error";
import { isSafeEntryName, isServiceEntry } from "./zip-names";

/** Коэффициент сжатия, выше которого запись считается zip-бомбой. */
const DEFAULT_MAX_COMPRESSION_RATIO = 100;
/** Коэффициент проверяется для записей от этого размера: мелкий текст сжимается сильно. */
const RATIO_MIN_BYTES = 1024 * 1024;

export interface IZipEntry {
  /** Нормализованный относительный путь внутри архива (`/`-разделители). */
  name: string;
  /** Размер после распаковки (из заголовка, проверяется при чтении). */
  size: number;
  compressedSize: number;
  lastModified: Date;
}

export interface IExtractZipLimits {
  /** Записей в архиве (включая каталоги и пропущенные). */
  maxEntries: number;
  /** Сумма распакованных байт извлекаемых записей. */
  maxTotalBytes: number;
  /** Распакованный размер одной записи. */
  maxEntryBytes: number;
  /** Распакованный / сжатый размер записи; по умолчанию 100. */
  maxCompressionRatio?: number;
  /** Размер архива, принимаемого потоком (он пишется во временный файл). */
  maxArchiveBytes?: number;
}

export type TSkipReason = "unsafe" | "service" | "encrypted" | "filtered";

export interface IExtractZipOptions {
  /** Путь к архиву или поток (сохраняется во временный файл: zip читается с конца). */
  source: string | Readable;
  /** `false` — запись пропускается (`filtered`). */
  filter?: (entry: IZipEntry) => boolean;
  /**
   * Обработчик записи. Поток нужно дочитать до конца обработчика; недочитанный
   * закрывается. Ошибка обработчика прерывает распаковку.
   */
  onEntry: (entry: IZipEntry, stream: Readable) => Promise<void>;
  signal?: AbortSignal;
  limits: IExtractZipLimits;
}

export interface IExtractZipResult {
  /** Передано в `onEntry`. */
  extracted: number;
  /** Распакованных байт передано в `onEntry`. */
  totalBytes: number;
  skipped: { name: string; reason: TSkipReason }[];
}

const openZip = async (filePath: string): Promise<yauzl.ZipFile> => {
  try {
    return await yauzl.openPromise(filePath, {
      lazyEntries: true,
      autoClose: false,
      decodeStrings: false,
      validateEntrySizes: true,
    });
  } catch (err) {
    throw new ArchiveError(
      "ARCHIVE_INVALID",
      `Не удалось открыть архив: ${(err as Error).message}`,
    );
  }
};

/** Следующая запись; `null` — записи кончились. */
const nextEntry = (zip: yauzl.ZipFile): Promise<yauzl.Entry | null> =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      zip.off("entry", onEntry);
      zip.off("end", onEnd);
      zip.off("error", onError);
    };
    const onEntry = (entry: yauzl.Entry) => {
      cleanup();
      resolve(entry);
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(new ArchiveError("ARCHIVE_INVALID", err.message));
    };

    zip.on("entry", onEntry);
    zip.on("end", onEnd);
    zip.on("error", onError);
    zip.readEntry();
  });

const entryName = (entry: yauzl.Entry): string =>
  yauzl.getFileNameLowLevel(
    entry.generalPurposeBitFlag,
    entry.fileNameRaw,
    entry.extraFields,
    true,
  );

const assertWithinLimits = (
  entry: IZipEntry,
  totalBytes: number,
  limits: IExtractZipLimits,
) => {
  const maxRatio = limits.maxCompressionRatio ?? DEFAULT_MAX_COMPRESSION_RATIO;

  if (entry.size > limits.maxEntryBytes) {
    throw new ArchiveError(
      "ARCHIVE_ENTRY_TOO_LARGE",
      `Запись ${entry.name} больше допустимого размера`,
    );
  }

  if (totalBytes + entry.size > limits.maxTotalBytes) {
    throw new ArchiveError(
      "ARCHIVE_TOO_LARGE",
      "Распакованный архив больше допустимого размера",
    );
  }

  if (
    entry.size >= RATIO_MIN_BYTES &&
    entry.size / Math.max(entry.compressedSize, 1) > maxRatio
  ) {
    throw new ArchiveError(
      "ARCHIVE_COMPRESSION_RATIO",
      `Подозрительно высокая степень сжатия записи ${entry.name}`,
    );
  }
};

/** Считает байты потока; сверх `limit` — ошибка (заголовок мог солгать). */
const countingStream = (limit: number, onBytes: (n: number) => void) => {
  let seen = 0;

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      onBytes(chunk.length);
      callback(
        seen > limit
          ? new ArchiveError(
              "ARCHIVE_ENTRY_TOO_LARGE",
              "Запись больше заявленного размера",
            )
          : null,
        chunk,
      );
    },
  });
};

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Распаковка отменена", "AbortError");

const extractFile = async (
  filePath: string,
  { filter, onEntry, signal, limits }: IExtractZipOptions,
): Promise<IExtractZipResult> => {
  const zip = await openZip(filePath);
  const result: IExtractZipResult = {
    extracted: 0,
    totalBytes: 0,
    skipped: [],
  };

  try {
    if (zip.entryCount > limits.maxEntries) {
      throw new ArchiveError(
        "ARCHIVE_TOO_MANY_ENTRIES",
        `В архиве больше ${limits.maxEntries} записей`,
      );
    }

    for (
      let raw = await nextEntry(zip);
      raw !== null;
      raw = await nextEntry(zip)
    ) {
      signal?.throwIfAborted();

      const name = entryName(raw);

      if (name.endsWith("/") && isSafeEntryName(name)) continue;

      const entry: IZipEntry = {
        name,
        size: raw.uncompressedSize,
        compressedSize: raw.compressedSize,
        lastModified: raw.getLastModDate(),
      };
      const reason: TSkipReason | null = !isSafeEntryName(name)
        ? "unsafe"
        : isServiceEntry(name)
          ? "service"
          : raw.isEncrypted()
            ? "encrypted"
            : filter && !filter(entry)
              ? "filtered"
              : null;

      if (reason) {
        result.skipped.push({ name, reason });
        continue;
      }

      assertWithinLimits(entry, result.totalBytes, limits);

      const source = await zip.openReadStreamPromise(raw);
      const counted = countingStream(entry.size, n => {
        result.totalBytes += n;
      });
      const onAbort = () => counted.destroy(abortError(signal!));

      // Ошибка потока доходит до обработчика через его pipeline; без
      // подписчика (поток уже дочитан) она не должна становиться uncaught.
      counted.on("error", () => undefined);

      source.on("error", err =>
        counted.destroy(new ArchiveError("ARCHIVE_INVALID", err.message)),
      );
      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        await onEntry(entry, source.pipe(counted));
      } finally {
        signal?.removeEventListener("abort", onAbort);
        if (!counted.readableEnded) {
          source.destroy();
          counted.destroy();
        }
      }

      result.extracted += 1;
    }

    return result;
  } finally {
    zip.close();
  }
};

/** Поток архива во временный файл с лимитом размера. */
const withSpooledArchive = async <R>(
  source: Readable,
  maxBytes: number,
  fn: (filePath: string) => Promise<R>,
): Promise<R> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zip-"));
  const filePath = path.join(dir, "archive.zip");

  try {
    await pipeline(
      source,
      countingStream(maxBytes, () => undefined),
      createWriteStream(filePath),
    ).catch((err: unknown) => {
      throw err instanceof ArchiveError
        ? new ArchiveError(
            "ARCHIVE_TOO_LARGE",
            "Архив больше допустимого размера",
          )
        : err;
    });

    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

/**
 * Распаковка zip по одной записи с защитой от zip-бомб (число записей,
 * сумма и размер распакованного, коэффициент сжатия, фактические байты) и
 * от path traversal (такие записи пропускаются как `unsafe`). Каталоги,
 * `__MACOSX` и dot-файлы пропускаются. Нарушение лимита — `ArchiveError`.
 */
export const extractZip = async (
  options: IExtractZipOptions,
): Promise<IExtractZipResult> => {
  options.signal?.throwIfAborted();

  if (typeof options.source === "string") {
    return extractFile(options.source, options);
  }

  return withSpooledArchive(
    options.source,
    options.limits.maxArchiveBytes ?? options.limits.maxTotalBytes,
    filePath => extractFile(filePath, options),
  );
};
