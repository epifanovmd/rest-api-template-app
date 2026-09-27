import { Readable, Writable } from "stream";
import { finished, pipeline } from "stream/promises";
import yazl from "yazl";

import { ArchiveError } from "./archive.error";
import { isSafeEntryName } from "./zip-names";

export type TZipSourceEntry = {
  /** Путь внутри архива, `/`-разделители. */
  name: string;
  mtime?: Date;
} & ({ buffer: Buffer } | { stream: Readable });

/**
 * Сборка zip потоком в `output` (yazl). Записи берутся из итератора по
 * одной: следующий поток открывается, когда предыдущий прочитан, — открытых
 * файлов не больше одного. Небезопасное имя — `ARCHIVE_UNSAFE_NAME`.
 * Возвращает число записей.
 */
export const createZip = async (
  entries: AsyncIterable<TZipSourceEntry> | Iterable<TZipSourceEntry>,
  output: Writable,
): Promise<number> => {
  const zip = new yazl.ZipFile();
  const zipStream = zip.outputStream as Readable;
  const written = pipeline(zipStream, output);
  const zipError = new Promise<never>((_, reject) => {
    zip.once("error", reject);
  });

  // Промисы наблюдаются в гонках ниже; здесь — только от unhandled rejection.
  written.catch(() => undefined);
  zipError.catch(() => undefined);

  let count = 0;

  try {
    for await (const entry of entries) {
      if (!isSafeEntryName(entry.name) || entry.name.endsWith("/")) {
        throw new ArchiveError(
          "ARCHIVE_UNSAFE_NAME",
          `Недопустимое имя записи: ${entry.name}`,
        );
      }

      const options = entry.mtime ? { mtime: entry.mtime } : {};

      if ("buffer" in entry) {
        zip.addBuffer(entry.buffer, entry.name, options);
      } else {
        zip.addReadStream(entry.stream, entry.name, options);
        await Promise.race([finished(entry.stream), zipError]);
      }

      count += 1;
    }

    zip.end();
    await Promise.race([written, zipError]);

    return count;
  } catch (err) {
    zipStream.destroy(err as Error);
    await written.catch(() => undefined);
    throw err;
  }
};
