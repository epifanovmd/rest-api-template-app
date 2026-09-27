import { expect } from "chai";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { PassThrough, Readable } from "stream";
import { buffer, text } from "stream/consumers";

import { ArchiveError } from "./archive.error";
import { createZip, TZipSourceEntry } from "./create-zip";
import { extractZip, IExtractZipLimits } from "./extract-zip";

const LIMITS: IExtractZipLimits = {
  maxEntries: 100,
  maxTotalBytes: 50 * 1024 * 1024,
  maxEntryBytes: 50 * 1024 * 1024,
};

const zipToBuffer = async (entries: TZipSourceEntry[]): Promise<Buffer> => {
  const out = new PassThrough();
  const collected = buffer(out);

  await createZip(entries, out);

  return collected;
};

/** Подмена имени в заголовках: yazl не даёт создать `../`, а атакующий может. */
const renameEntry = (zip: Buffer, from: string, to: string): Buffer => {
  expect(from.length).to.equal(to.length);

  return Buffer.from(zip.toString("latin1").split(from).join(to), "latin1");
};

const collect = async (source: string | Readable, limits = LIMITS) => {
  const files: Record<string, string> = {};
  const result = await extractZip({
    source,
    limits,
    onEntry: async (entry, stream) => {
      files[entry.name] = await text(stream);
    },
  });

  return { files, result };
};

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return (err as ArchiveError).code;
  }

  return undefined;
};

describe("archive: createZip + extractZip", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-test-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("круговой прогон: буферы и потоки, из файла и из потока", async () => {
    const entries = async function* () {
      yield { name: "a.txt", buffer: Buffer.from("alpha") };
      yield { name: "dir/b.txt", stream: Readable.from(["be", "ta"]) };
    };
    const zipPath = path.join(dir, "out.zip");
    const count = await createZip(entries(), createWriteStream(zipPath));

    expect(count).to.equal(2);

    const fromFile = await collect(zipPath);
    const fromStream = await collect(Readable.from(await fs.readFile(zipPath)));

    expect(fromFile.files).to.deep.equal({
      "a.txt": "alpha",
      "dir/b.txt": "beta",
    });
    expect(fromStream.files).to.deep.equal(fromFile.files);
    expect(fromFile.result).to.deep.include({ extracted: 2, totalBytes: 9 });
  });

  it("пропускает __MACOSX и dot-файлы, применяет filter", async () => {
    const zip = await zipToBuffer([
      { name: "keep.jpg", buffer: Buffer.from("1") },
      { name: "__MACOSX/._keep.jpg", buffer: Buffer.from("2") },
      { name: ".DS_Store", buffer: Buffer.from("3") },
      { name: "sub/.hidden", buffer: Buffer.from("4") },
      { name: "note.txt", buffer: Buffer.from("5") },
    ]);
    const files: string[] = [];
    const result = await extractZip({
      source: Readable.from(zip),
      limits: LIMITS,
      filter: entry => entry.name.endsWith(".jpg"),
      onEntry: async (entry, stream) => {
        files.push(entry.name);
        stream.resume();
      },
    });

    expect(files).to.deep.equal(["keep.jpg"]);
    expect(result.skipped).to.deep.equal([
      { name: "__MACOSX/._keep.jpg", reason: "service" },
      { name: ".DS_Store", reason: "service" },
      { name: "sub/.hidden", reason: "service" },
      { name: "note.txt", reason: "filtered" },
    ]);
  });

  it("path traversal: ../, абсолютный путь и \\ пропускаются как unsafe", async () => {
    let zip = await zipToBuffer([
      { name: "xx/evil.txt", buffer: Buffer.from("evil") },
      { name: "xetc/passwd", buffer: Buffer.from("root") },
      { name: "yy-win.txt", buffer: Buffer.from("win") },
      { name: "ok.txt", buffer: Buffer.from("ok") },
    ]);

    zip = renameEntry(zip, "xx/evil.txt", "../evil.txt");
    zip = renameEntry(zip, "xetc/passwd", "/etc/passwd");
    zip = renameEntry(zip, "yy-win.txt", "..\\win.txt");

    const { files, result } = await collect(Readable.from(zip));

    expect(files).to.deep.equal({ "ok.txt": "ok" });
    expect(result.skipped.map(s => s.reason)).to.deep.equal([
      "unsafe",
      "unsafe",
      "unsafe",
    ]);
  });

  it("zip-бомба по коэффициенту сжатия отклоняется до распаковки", async () => {
    const zip = await zipToBuffer([
      { name: "zeros.bin", buffer: Buffer.alloc(20 * 1024 * 1024) },
    ]);
    let opened = false;
    const code = await codeOf(
      extractZip({
        source: Readable.from(zip),
        limits: LIMITS,
        onEntry: async () => {
          opened = true;
        },
      }),
    );

    expect(zip.length).to.be.lessThan(100 * 1024);
    expect(code).to.equal("ARCHIVE_COMPRESSION_RATIO");
    expect(opened).to.equal(false);
  });

  it("сумма распакованного, размер записи и число записей ограничены", async () => {
    const zip = await zipToBuffer([
      { name: "a.bin", buffer: Buffer.alloc(600, 1) },
      { name: "b.bin", buffer: Buffer.alloc(600, 2) },
    ]);

    expect(
      await codeOf(
        collect(Readable.from(zip), { ...LIMITS, maxTotalBytes: 1000 }),
      ),
    ).to.equal("ARCHIVE_TOO_LARGE");
    expect(
      await codeOf(
        collect(Readable.from(zip), { ...LIMITS, maxEntryBytes: 500 }),
      ),
    ).to.equal("ARCHIVE_ENTRY_TOO_LARGE");
    expect(
      await codeOf(collect(Readable.from(zip), { ...LIMITS, maxEntries: 1 })),
    ).to.equal("ARCHIVE_TOO_MANY_ENTRIES");
    expect(
      await codeOf(
        collect(Readable.from(zip), { ...LIMITS, maxArchiveBytes: 100 }),
      ),
    ).to.equal("ARCHIVE_TOO_LARGE");
  });

  it("заголовок, занижающий размер, не обманывает проверку", async () => {
    const zip = await zipToBuffer([
      { name: "a.txt", buffer: Buffer.from("0123456789".repeat(10)) },
    ]);
    // Подменить uncompressedSize (100) в центральном каталоге на 10.
    const cdOffset = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const forged = Buffer.from(zip);

    forged.writeUInt32LE(10, cdOffset + 24);

    expect(await codeOf(collect(Readable.from(forged)))).to.be.oneOf([
      "ARCHIVE_INVALID",
      "ARCHIVE_ENTRY_TOO_LARGE",
    ]);
  });

  it("битый архив — ARCHIVE_INVALID", async () => {
    expect(
      await codeOf(collect(Readable.from(Buffer.from("not a zip")))),
    ).to.equal("ARCHIVE_INVALID");
  });

  it("отмена через signal прерывает распаковку", async () => {
    const zip = await zipToBuffer([
      { name: "a.txt", buffer: Buffer.from("a") },
      { name: "b.txt", buffer: Buffer.from("b") },
    ]);
    const controller = new AbortController();
    const seen: string[] = [];
    let error: unknown;

    try {
      await extractZip({
        source: Readable.from(zip),
        limits: LIMITS,
        signal: controller.signal,
        onEntry: async (entry, stream) => {
          seen.push(entry.name);
          stream.resume();
          controller.abort();
        },
      });
    } catch (err) {
      error = err;
    }

    expect(seen).to.deep.equal(["a.txt"]);
    expect((error as Error).name).to.equal("AbortError");
  });

  it("createZip отклоняет небезопасные имена", async () => {
    for (const name of ["../x", "/abs", "a\\b", ""]) {
      expect(
        await codeOf(
          createZip(
            [{ name, buffer: Buffer.from("x") }],
            new PassThrough().resume(),
          ),
        ),
        name,
      ).to.equal("ARCHIVE_UNSAFE_NAME");
    }
  });
});
