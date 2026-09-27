import "reflect-metadata";

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { expect } from "chai";
import fs from "fs/promises";
import { Readable } from "stream";
import { text } from "stream/consumers";

import { HttpException } from "../../core";
import { IS3StorageOptions, S3FileStorage } from "./s3-file.storage";

/** Интеграционный тест против MinIO/S3: запускается, только если задан `TEST_S3_ENDPOINT`. */
const endpoint = process.env.TEST_S3_ENDPOINT;

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return (err as HttpException).code;
  }

  return undefined;
};

(endpoint ? describe : describe.skip)(
  "S3FileStorage (TEST_S3_ENDPOINT)",
  () => {
    const options: IS3StorageOptions = {
      bucket: `test-${Date.now()}`,
      region: "us-east-1",
      endpoint,
      accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID ?? "storage",
      secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY ?? "storage12345",
      forcePathStyle: true,
      ttlSeconds: 60,
    };
    const admin = new S3Client({
      region: options.region,
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
    let storage: S3FileStorage;

    before(async () => {
      await admin.send(new CreateBucketCommand({ Bucket: options.bucket }));
      storage = new S3FileStorage(options);
    });

    after(async () => {
      await storage.deletePrefix("t/");
      await admin.send(new DeleteBucketCommand({ Bucket: options.bucket }));
    });

    it("put буфера и потока без длины, get с диапазоном, stat", async () => {
      await storage.put("t/a.txt", Buffer.from("0123456789"), {
        contentType: "text/plain",
      });
      await storage.put("t/b.txt", Readable.from(["str", "eam"]));

      expect(
        await text(await storage.get("t/a.txt", { start: 2, end: 4 })),
      ).to.equal("234");
      expect(await text(await storage.get("t/b.txt"))).to.equal("stream");
      expect(await storage.stat("t/a.txt")).to.include({
        size: 10,
        contentType: "text/plain",
      });
      expect(await storage.stat("t/none.txt")).to.equal(null);
      expect(await codeOf(storage.get("t/none.txt"))).to.equal(
        "STORAGE_NOT_FOUND",
      );
    });

    it("presigned GET и PUT с подписанной длиной", async () => {
      const got = await fetch(
        await storage.signedGetUrl("t/a.txt", { downloadName: "a.txt" }),
      );

      expect(got.status).to.equal(200);
      expect(await got.text()).to.equal("0123456789");
      expect(got.headers.get("content-disposition")).to.include("attachment");

      const putUrl = await storage.signedPutUrl("t/up.bin", {
        contentType: "application/octet-stream",
        contentLength: 4,
      });
      const wrongLength = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: Buffer.from("123456"),
      });
      const ok = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: Buffer.from("1234"),
      });

      expect(wrongLength.status).to.equal(403);
      expect(ok.status).to.equal(200);
      expect((await storage.stat("t/up.bin"))?.size).to.equal(4);
    });

    it("withLocalFile — временная копия удаляется после вызова", async () => {
      let tmpPath = "";
      const content = await storage.withLocalFile("t/a.txt", async p => {
        tmpPath = p;

        return fs.readFile(p, "utf8");
      });

      expect(content).to.equal("0123456789");
      const exists = await fs.access(tmpPath).then(
        () => true,
        () => false,
      );

      expect(exists).to.equal(false);
    });

    it("deletePrefix удаляет всё под префиксом", async () => {
      await storage.put("t/p/1.txt", Buffer.from("1"));
      await storage.put("t/p/2.txt", Buffer.from("2"));
      await storage.deletePrefix("t/p/");

      expect(await storage.stat("t/p/1.txt")).to.equal(null);
      expect(await storage.stat("t/p/2.txt")).to.equal(null);
      expect(await storage.stat("t/a.txt")).to.not.equal(null);
    });
  },
);
