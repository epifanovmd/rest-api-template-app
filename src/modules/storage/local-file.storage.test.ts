import "reflect-metadata";

import { expect } from "chai";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { text } from "stream/consumers";

import { HttpException } from "../../core";
import { LocalFileStorage } from "./local-file.storage";
import { StorageUrlSigner } from "./storage-url.signer";

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return (err as HttpException).code;
  }

  return undefined;
};

describe("LocalFileStorage", () => {
  let base: string;
  let root: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "local-storage-"));
    root = path.join(base, "root");
    storage = new LocalFileStorage(
      new StorageUrlSigner({
        secret: "s".repeat(32),
        publicUrl: "http://api.test",
        ttlSeconds: 60,
      }),
      root,
    );
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it("put буфера, потока и файла; stat с типом и etag", async () => {
    const source = path.join(base, "src.txt");

    await fs.writeFile(source, "from-path");
    await storage.put("a/buf.txt", Buffer.from("buffer"), {
      contentType: "text/plain",
    });
    await storage.put("a/stream.txt", Readable.from(["str", "eam"]));
    await storage.put("a/path.txt", { path: source });

    expect(await fs.readFile(path.join(root, "a/buf.txt"), "utf8")).to.equal(
      "buffer",
    );
    expect(await text(await storage.get("a/stream.txt"))).to.equal("stream");
    expect(await text(await storage.get("a/path.txt"))).to.equal("from-path");
    expect(await fs.readFile(source, "utf8")).to.equal("from-path");

    const stat = await storage.stat("a/buf.txt");

    expect(stat).to.include({ size: 6, contentType: "text/plain" });
    expect(stat?.etag).to.match(/^"[0-9a-f]+-[0-9a-f]+"$/);
    expect(await storage.stat("a/missing.txt")).to.equal(null);
  });

  it("запись атомарна: во временных файлах ничего не остаётся, сбой потока не оставляет объект", async () => {
    const failing = new Readable({
      read() {
        this.destroy(new Error("boom"));
      },
    });

    await storage.put("x/ok.bin", Buffer.from("1"));

    let failed = false;

    try {
      await storage.put("x/broken.bin", failing);
    } catch {
      failed = true;
    }

    expect(failed).to.equal(true);
    expect(await storage.stat("x/broken.bin")).to.equal(null);
    expect(await fs.readdir(path.join(root, ".tmp"))).to.deep.equal([]);
  });

  it("перезапись заменяет объект целиком", async () => {
    await storage.put("k.txt", Buffer.from("long content"));
    await storage.put("k.txt", Buffer.from("short"));

    expect(await text(await storage.get("k.txt"))).to.equal("short");
  });

  it("get с диапазоном", async () => {
    await storage.put("r.txt", Buffer.from("0123456789"));

    expect(
      await text(await storage.get("r.txt", { start: 2, end: 4 })),
    ).to.equal("234");
    expect(await text(await storage.get("r.txt", { start: 7 }))).to.equal(
      "789",
    );
  });

  it("get отсутствующего — STORAGE_NOT_FOUND", async () => {
    expect(await codeOf(storage.get("nope.txt"))).to.equal("STORAGE_NOT_FOUND");
  });

  it("выход за корень и служебные каталоги недоступны", async () => {
    await fs.writeFile(path.join(base, "secret.txt"), "TOP");

    for (const key of [
      "../secret.txt",
      "a/../../secret.txt",
      "/etc/passwd",
      ".tmp/x",
      ".meta/a.json",
      "a//b",
      "a\\..\\b",
      "",
    ]) {
      expect(await codeOf(storage.get(key)), key).to.equal(
        "STORAGE_INVALID_KEY",
      );
      expect(await codeOf(storage.put(key, Buffer.from("x"))), key).to.equal(
        "STORAGE_INVALID_KEY",
      );
    }

    expect(await codeOf(storage.deletePrefix("../"))).to.equal(
      "STORAGE_INVALID_KEY",
    );
    expect(await codeOf(storage.deletePrefix(""))).to.equal(
      "STORAGE_INVALID_KEY",
    );
  });

  it("delete и deletePrefix по папке и по началу имени", async () => {
    await storage.put("files/1/a.txt", Buffer.from("a"), {
      contentType: "text/plain",
    });
    await storage.put("files/1/b.txt", Buffer.from("b"));
    await storage.put("files/2/a.txt", Buffer.from("a"));
    await storage.put("files/20/a.txt", Buffer.from("a"));
    await storage.put("files/3/a.txt", Buffer.from("a"));

    await storage.delete("files/1/a.txt");
    expect(await storage.stat("files/1/a.txt")).to.equal(null);

    await storage.deletePrefix("files/1/");
    expect(await storage.stat("files/1/b.txt")).to.equal(null);

    await storage.deletePrefix("files/2");
    expect(await storage.stat("files/2/a.txt")).to.equal(null);
    expect(await storage.stat("files/20/a.txt")).to.equal(null);
    expect(await storage.stat("files/3/a.txt")).to.not.equal(null);

    await storage.deletePrefix("nothing/here/");
    await fs.access(path.join(root, ".meta/files/3/a.txt.json"));
  });

  it("withLocalFile даёт путь к объекту внутри корня", async () => {
    await storage.put("w/file.txt", Buffer.from("local"));

    const content = await storage.withLocalFile("w/file.txt", async p => {
      expect(p.startsWith(root)).to.equal(true);

      return fs.readFile(p, "utf8");
    });

    expect(content).to.equal("local");
    expect(
      await codeOf(storage.withLocalFile("w/none.txt", async () => 1)),
    ).to.equal("STORAGE_NOT_FOUND");
  });

  it("подписанные ссылки ведут на /files/<key>", async () => {
    const get = new URL(await storage.signedGetUrl("a/b.png"));
    const put = new URL(
      await storage.signedPutUrl("a/b.png", { contentType: "image/png" }),
    );

    expect(get.pathname).to.equal("/files/a/b.png");
    expect(get.searchParams.get("sig")).to.be.a("string");
    expect(put.searchParams.get("ct")).to.equal("image/png");
  });
});
