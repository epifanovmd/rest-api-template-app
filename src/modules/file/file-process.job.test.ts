import "reflect-metadata";

import { expect } from "chai";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import sinon from "sinon";

import { JobError } from "../../core";
import { createMockEventBus, uuid } from "../../test/helpers";
import { LocalFileStorage, StorageUrlSigner } from "../storage";
import { FileProcessedEvent } from "./events";
import { EFileStatus } from "./file.types";
import { FileProcessJob } from "./file-process.job";
import { MediaProcessorService } from "./media-processor.service";

describe("FileProcessJob", () => {
  const fileId = uuid();
  const key = `files/${fileId}/original.png`;
  let tmpDir: string;
  let storage: LocalFileStorage;
  let files: { findById: sinon.SinonStub; transitionStatus: sinon.SinonStub };
  let eventBus: ReturnType<typeof createMockEventBus>;
  let media: MediaProcessorService;
  let job: FileProcessJob;

  const ctx = (attempt = 0) => ({
    id: "job-1",
    queue: "file.process",
    data: { fileId },
    attempt,
    signal: new AbortController().signal,
    progress: sinon.stub().resolves(),
    log: sinon.stub().resolves(),
  });

  const file = (overrides: Record<string, unknown> = {}) => ({
    id: fileId,
    ownerId: "owner-1",
    name: "photo.png",
    type: "image/png",
    status: EFileStatus.Processing,
    key,
    ...overrides,
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-job-"));
    storage = new LocalFileStorage(
      new StorageUrlSigner({
        secret: "s".repeat(32),
        publicUrl: "http://api.test",
        ttlSeconds: 60,
      }),
      tmpDir,
    );
    files = {
      findById: sinon.stub().resolves(file()),
      transitionStatus: sinon.stub().resolves(true),
    };
    eventBus = createMockEventBus();
    media = new MediaProcessorService();
    job = new FileProcessJob(files as any, storage, media, eventBus as any);

    const png = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#3366cc" },
    })
      .png()
      .toBuffer();

    await storage.put(key, png, { contentType: "image/png" });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("изображение: webp и превью в хранилище, ready, событие владельцу", async () => {
    await job.handle(ctx());

    const [id, from, changes] = files.transitionStatus.firstCall.args;

    expect([id, from]).to.deep.equal([fileId, EFileStatus.Processing]);
    expect(changes).to.include({
      status: EFileStatus.Ready,
      width: 640,
      height: 480,
      optimizedKey: `files/${fileId}/optimized.webp`,
      thumbnailKey: `files/${fileId}/thumbnail.webp`,
      mediumKey: `files/${fileId}/medium.webp`,
    });
    expect(changes.blurhash).to.be.a("string");
    expect(await storage.stat(`files/${fileId}/optimized.webp`)).to.include({
      contentType: "image/webp",
    });
    expect(await storage.stat(key)).to.not.equal(null);

    const event = eventBus.emit.firstCall.args[0] as FileProcessedEvent;

    expect(event).to.be.instanceOf(FileProcessedEvent);
    expect(event).to.include({
      fileId,
      ownerId: "owner-1",
      status: EFileStatus.Ready,
    });
  });

  it("файл удалён или уже обработан — задача ничего не делает", async () => {
    files.findById.resolves(null);
    await job.handle(ctx());
    files.findById.resolves(file({ status: EFileStatus.Ready }));
    await job.handle(ctx());

    expect(files.transitionStatus.called).to.equal(false);
    expect(eventBus.emit.called).to.equal(false);
  });

  it("сбой до последней попытки — ошибка для повтора, статус не меняется", async () => {
    sinon.stub(media, "process").rejects(new Error("decode failed"));

    let error: unknown;

    try {
      await job.handle(ctx(0));
    } catch (err) {
      error = err;
    }

    expect((error as Error).message).to.equal("decode failed");
    expect(files.transitionStatus.called).to.equal(false);
  });

  it("последняя попытка: failed, событие и JobError без повтора", async () => {
    sinon.stub(media, "process").rejects(new Error("decode failed"));

    let error: unknown;

    try {
      await job.handle(ctx(job.definition.retryLimit));
    } catch (err) {
      error = err;
    }

    expect(error).to.be.instanceOf(JobError);
    expect((error as JobError).retryable).to.equal(false);
    expect(files.transitionStatus.firstCall.args[2]).to.deep.equal({
      status: EFileStatus.Failed,
    });
    expect(eventBus.emit.firstCall.args[0].status).to.equal(EFileStatus.Failed);
  });

  it("файл удалён во время обработки — производные убираются", async () => {
    files.transitionStatus.resolves(false);
    files.findById.onSecondCall().resolves(null);

    await job.handle(ctx());

    expect(await storage.stat(`files/${fileId}/optimized.webp`)).to.equal(null);
    expect(eventBus.emit.called).to.equal(false);
  });

  it("definition: очередь file.process, 2 повтора", () => {
    expect(job.definition).to.include({ queue: "file.process", retryLimit: 2 });
  });
});
