import "reflect-metadata";

import { expect } from "chai";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sinon from "sinon";

import { HttpException } from "../../core";
import {
  createMockEventBus,
  createMockJobQueue,
  createMockRepository,
  uuid,
  uuid2,
} from "../../test/helpers";
import { LocalFileStorage, StorageUrlSigner } from "../storage";
import { FileDeletedEvent, FileUploadedEvent } from "./events";
import { FileService } from "./file.service";
import { EFileStatus, FileQueues } from "./file.types";
import { reserveFileKey } from "./file-keys";
import { FileUrlService } from "./file-url.service";
import { FileUsageChecker } from "./file-usage.checker";

const PDF_HEADER = Buffer.from("%PDF-1.7\n1 0 obj\n", "latin1");
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return (err as HttpException).code;
  }

  return "no error";
};

describe("FileService", () => {
  let service: FileService;
  let fileRepo: ReturnType<typeof createMockRepository> & Record<string, any>;
  let txRepo: ReturnType<typeof createMockRepository>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let jobs: ReturnType<typeof createMockJobQueue>;
  let usageProbe: { filesInUse: sinon.SinonStub };
  let storage: LocalFileStorage;
  let tmpDir: string;
  let manager: { getRepository: sinon.SinonStub };

  const fileId = uuid();
  const ownerId = uuid();
  const strangerId = uuid2();

  /** Пользователь с правами на свои файлы (как роль `user` после засева). */
  const OWN_FILE_PERMISSIONS = ["file:view:own", "file:delete:own"];

  const makeUser = (
    userId: string,
    roles: string[] = ["user"],
    permissions: string[] = OWN_FILE_PERMISSIONS,
  ) => ({
    userId,
    sessionId: "s-1",
    roles,
    permissions,
    emailVerified: true,
  });

  const makeFile = (overrides: Record<string, unknown> = {}) => ({
    id: fileId,
    ownerId,
    name: "document.pdf",
    type: "application/pdf",
    size: PDF_HEADER.length,
    status: EFileStatus.Ready,
    key: `files/${fileId}/original.pdf`,
    optimizedKey: null,
    thumbnailKey: null,
    mediumKey: null,
    blurhash: null,
    width: null,
    height: null,
    duration: null,
    waveform: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const makeUpload = async (name: string, data: Buffer, mimetype: string) => {
    const filePath = path.join(tmpDir, `upload-${Math.random()}-${name}`);

    await fs.writeFile(filePath, data);

    return { originalname: name, mimetype, path: filePath, size: data.length };
  };

  const exists = (p: string) =>
    fs.access(p).then(
      () => true,
      () => false,
    );

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-service-"));
    storage = new LocalFileStorage(
      new StorageUrlSigner({
        secret: "s".repeat(32),
        publicUrl: "http://api.test",
        ttlSeconds: 600,
      }),
      path.join(tmpDir, "storage"),
    );
    fileRepo = createMockRepository() as any;
    fileRepo.findById = sinon.stub().resolves(null);
    fileRepo.findPage = sinon.stub().resolves([[], 0]);
    fileRepo.transitionStatus = sinon.stub().resolves(true);
    txRepo = createMockRepository();
    txRepo.save.callsFake(async (entity: any) => entity);
    manager = { getRepository: sinon.stub().returns(txRepo) };
    eventBus = createMockEventBus();
    jobs = createMockJobQueue();
    usageProbe = { filesInUse: sinon.stub().resolves([]) };

    const dataSource = {
      transaction: sinon.stub().callsFake((cb: any) => cb(manager)),
    };

    service = new FileService(
      fileRepo as any,
      new FileUrlService(storage),
      storage,
      jobs as any,
      eventBus as any,
      dataSource as any,
      new FileUsageChecker([usageProbe]),
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("getFileById", () => {
    it("DTO с подписанными ссылками, без ключей хранилища", async () => {
      fileRepo.findById.resolves(makeFile());

      const dto = await service.getFileById(fileId);

      expect(dto.url).to.match(
        new RegExp(`^http://api.test/files/files/${fileId}/original.pdf\\?`),
      );
      expect(new URL(dto.downloadUrl!).searchParams.get("dl")).to.equal(
        "document.pdf",
      );
      expect(dto).to.not.have.property("key");
      expect(dto.status).to.equal(EFileStatus.Ready);
    });

    it("показ — оптимизированная версия, если есть", async () => {
      fileRepo.findById.resolves(
        makeFile({
          type: "image/png",
          optimizedKey: `files/${fileId}/optimized.webp`,
          thumbnailKey: `files/${fileId}/thumbnail.webp`,
        }),
      );

      const dto = await service.getFileById(fileId);

      expect(new URL(dto.url!).pathname).to.equal(
        `/files/files/${fileId}/optimized.webp`,
      );
      expect(new URL(dto.thumbnailUrl!).pathname).to.equal(
        `/files/files/${fileId}/thumbnail.webp`,
      );
      expect(dto.mediumUrl).to.equal(null);
    });

    it("нет файла — FILE_NOT_FOUND", async () => {
      expect(await codeOf(service.getFileById(fileId))).to.equal(
        "FILE_NOT_FOUND",
      );
    });
  });

  describe("getFile", () => {
    it("свой файл — с правом на свои", async () => {
      fileRepo.findById.resolves(makeFile());

      const dto = await service.getFile(makeUser(ownerId), fileId);

      expect(dto.id).to.equal(fileId);
    });

    it("чужой файл без права на все — FILE_NOT_FOUND, с правом — виден", async () => {
      fileRepo.findById.resolves(makeFile());

      expect(
        await codeOf(service.getFile(makeUser(strangerId), fileId)),
      ).to.equal("FILE_NOT_FOUND");
      expect(
        (await service.getFile(makeUser(strangerId, [], ["file:view"]), fileId))
          .id,
      ).to.equal(fileId);
      expect(
        (await service.getFile(makeUser(strangerId, ["admin"], []), fileId)).id,
      ).to.equal(fileId);
    });

    it("файл домена (без владельца) — только с правом на все", async () => {
      fileRepo.findById.resolves(makeFile({ ownerId: null }));

      expect(await codeOf(service.getFile(makeUser(ownerId), fileId))).to.equal(
        "FILE_NOT_FOUND",
      );
      expect(
        (await service.getFile(makeUser(ownerId, [], ["file:*"]), fileId)).id,
      ).to.equal(fileId);
    });
  });

  describe("listFiles", () => {
    it("страница IPaginatedDto с нормализованными offset/limit", async () => {
      fileRepo.findPage.resolves([[makeFile()], 41]);

      const page = await service.listFiles(makeUser(ownerId), true, -5, 1000);

      expect(fileRepo.findPage.firstCall.args).to.deep.equal([
        { ownedBy: ownerId },
        { offset: 0, limit: 100 },
      ]);
      expect(page).to.include({ total: 41, offset: 0, limit: 100 });
      expect(page.items).to.have.length(1);
    });

    it("право на все без «Мои» — все файлы; право на свои — всегда свои", async () => {
      await service.listFiles(makeUser(ownerId, [], ["file:view"]), false);
      await service.listFiles(makeUser(ownerId), false);

      expect(fileRepo.findPage.firstCall.args[0]).to.deep.equal({});
      expect(fileRepo.findPage.secondCall.args[0]).to.deep.equal({
        ownedBy: ownerId,
      });
    });

    it("нет права просмотра — FILE_FORBIDDEN", async () => {
      expect(
        await codeOf(service.listFiles(makeUser(ownerId, [], []), true)),
      ).to.equal("FILE_FORBIDDEN");
      expect(fileRepo.findPage.called).to.equal(false);
    });
  });

  describe("uploadFile", () => {
    it("документ: оригинал в хранилище, статус ready, без задачи, временный файл удалён", async () => {
      const upload = await makeUpload(
        "document.pdf",
        PDF_HEADER,
        "application/pdf",
      );
      const [dto] = await service.uploadFile([upload as any], ownerId);

      expect(dto.status).to.equal(EFileStatus.Ready);
      expect(await storage.stat(`files/${dto.id}/original.pdf`)).to.include({
        size: PDF_HEADER.length,
        contentType: "application/pdf",
      });
      expect(jobs.enqueue.called).to.equal(false);
      expect(await exists(upload.path)).to.equal(false);
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        FileUploadedEvent,
      );
      expect(eventBus.emit.firstCall.args[0].userId).to.equal(ownerId);
    });

    it("медиа: processing и задача file.process в той же транзакции", async () => {
      const upload = await makeUpload("photo.png", PNG_HEADER, "image/png");
      const [dto] = await service.uploadFile([upload as any], ownerId);

      expect(dto.status).to.equal(EFileStatus.Processing);
      expect(jobs.enqueue.calledOnce).to.equal(true);

      const [queue, data, options] = jobs.enqueue.firstCall.args;

      expect(queue).to.equal(FileQueues.process);
      expect(data).to.deep.equal({ fileId: dto.id });
      expect(options.manager).to.equal(manager);
    });

    it("подмена содержимого: FILE_SIGNATURE_MISMATCH, ничего не сохранено", async () => {
      const upload = await makeUpload(
        "document.pdf",
        Buffer.from("MZ-exe"),
        "application/pdf",
      );

      expect(
        await codeOf(service.uploadFile([upload as any], ownerId)),
      ).to.equal("FILE_SIGNATURE_MISMATCH");
      expect(txRepo.save.called).to.equal(false);
      expect(await exists(upload.path)).to.equal(false);
      expect(await exists(path.join(tmpDir, "storage/files"))).to.equal(false);
    });

    it("сбой транзакции: объекты хранилища удаляются", async () => {
      const upload = await makeUpload(
        "document.pdf",
        PDF_HEADER,
        "application/pdf",
      );

      txRepo.save.rejects(new Error("db down"));

      expect(
        await codeOf(service.uploadFile([upload as any], ownerId)),
      ).to.equal(undefined);
      expect(
        await fs.readdir(path.join(tmpDir, "storage/files")),
      ).to.deep.equal([]);
    });
  });

  describe("прямая загрузка", () => {
    it("createUpload: pending-запись и подписанный PUT с размером и типом", async () => {
      const result = await service.createUpload(ownerId, {
        name: "big.pdf",
        size: 1234,
        contentType: "application/pdf",
      });
      const url = new URL(result.uploadUrl);

      expect(fileRepo.createAndSave.firstCall.args[0]).to.include({
        ownerId,
        status: EFileStatus.Pending,
        size: 1234,
        key: `files/${result.fileId}/original.pdf`,
      });
      expect(url.searchParams.get("len")).to.equal("1234");
      expect(url.searchParams.get("ct")).to.equal("application/pdf");
      expect(result.headers).to.deep.equal({
        "Content-Type": "application/pdf",
      });
      expect(result.expiresAt.getTime()).to.be.greaterThan(Date.now());
    });

    it("createUpload: тип не из белого списка — FILE_TYPE_NOT_ALLOWED", async () => {
      expect(
        await codeOf(
          service.createUpload(ownerId, {
            name: "a.exe",
            size: 1,
            contentType: "application/x-msdownload",
          }),
        ),
      ).to.equal("FILE_TYPE_NOT_ALLOWED");
    });

    it("complete: объект не загружен — FILE_UPLOAD_INCOMPLETE", async () => {
      fileRepo.findById.resolves(makeFile({ status: EFileStatus.Pending }));

      expect(await codeOf(service.completeUpload(fileId, ownerId))).to.equal(
        "FILE_UPLOAD_INCOMPLETE",
      );
    });

    it("complete: чужой файл — FILE_FORBIDDEN", async () => {
      fileRepo.findById.resolves(makeFile({ status: EFileStatus.Pending }));

      expect(await codeOf(service.completeUpload(fileId, strangerId))).to.equal(
        "FILE_FORBIDDEN",
      );
    });

    it("complete: размер не совпал — FILE_SIZE_MISMATCH, объект удалён", async () => {
      const file = makeFile({ status: EFileStatus.Pending, size: 999 });

      fileRepo.findById.resolves(file);
      await storage.put(file.key, PDF_HEADER);

      expect(await codeOf(service.completeUpload(fileId, ownerId))).to.equal(
        "FILE_SIZE_MISMATCH",
      );
      expect(await storage.stat(file.key)).to.equal(null);
    });

    it("complete: сигнатура не совпала — FILE_SIGNATURE_MISMATCH, запись и объект удалены", async () => {
      const content = Buffer.from("MZ-not-a-pdf");
      const file = makeFile({
        status: EFileStatus.Pending,
        size: content.length,
      });

      fileRepo.findById.resolves(file);
      await storage.put(file.key, content);

      expect(await codeOf(service.completeUpload(fileId, ownerId))).to.equal(
        "FILE_SIGNATURE_MISMATCH",
      );
      expect(fileRepo.delete.calledOnceWith(fileId)).to.equal(true);
      expect(await storage.stat(file.key)).to.equal(null);
    });

    it("complete: медиа переходит в processing и ставит задачу", async () => {
      const file = makeFile({
        status: EFileStatus.Pending,
        name: "photo.png",
        type: "image/png",
        size: PNG_HEADER.length,
        key: `files/${fileId}/original.png`,
      });

      fileRepo.findById
        .onFirstCall()
        .resolves(file)
        .onSecondCall()
        .resolves({ ...file, status: EFileStatus.Processing });
      await storage.put(file.key, PNG_HEADER);

      const dto = await service.completeUpload(fileId, ownerId);

      expect(
        fileRepo.transitionStatus.firstCall.args.slice(0, 3),
      ).to.deep.equal([
        fileId,
        EFileStatus.Pending,
        { status: EFileStatus.Processing },
      ]);
      expect(jobs.enqueue.firstCall.args[2].manager).to.equal(manager);
      expect(dto.status).to.equal(EFileStatus.Processing);
      expect(eventBus.emit.calledOnce).to.equal(true);
    });

    it("complete: повторный вызов после завершения не ставит задачу снова", async () => {
      fileRepo.findById.resolves(makeFile({ status: EFileStatus.Processing }));

      const dto = await service.completeUpload(fileId, ownerId);

      expect(dto.status).to.equal(EFileStatus.Processing);
      expect(jobs.enqueue.called).to.equal(false);
    });

    it("complete: гонка двух complete — задачу ставит только первый", async () => {
      const file = makeFile({ status: EFileStatus.Pending });

      fileRepo.findById.resolves(file);
      fileRepo.transitionStatus.resolves(false);
      await storage.put(file.key, PDF_HEADER);

      await service.completeUpload(fileId, ownerId);

      expect(jobs.enqueue.called).to.equal(false);
      expect(eventBus.emit.called).to.equal(false);
    });
  });

  describe("deleteFile", () => {
    it("владелец удаляет файл и все объекты под files/<id>/", async () => {
      fileRepo.findById.resolves(makeFile());
      await storage.put(`files/${fileId}/original.pdf`, PDF_HEADER);
      await storage.put(`files/${fileId}/thumbnail.webp`, Buffer.from("t"));

      await service.deleteFile(makeUser(ownerId), fileId);

      expect(fileRepo.delete.calledOnceWith(fileId)).to.equal(true);
      const event = eventBus.emit.firstCall.args[0];

      expect(event).to.be.instanceOf(FileDeletedEvent);
      expect(event.fileId).to.equal(fileId);
      expect(event.ownerId).to.equal(ownerId);
      expect(await storage.stat(`files/${fileId}/original.pdf`)).to.equal(null);
      expect(await storage.stat(`files/${fileId}/thumbnail.webp`)).to.equal(
        null,
      );
    });

    it("чужой невидимый файл — FILE_NOT_FOUND; суперпользователь — можно", async () => {
      fileRepo.findById.resolves(makeFile());

      expect(
        await codeOf(service.deleteFile(makeUser(strangerId), fileId)),
      ).to.equal("FILE_NOT_FOUND");
      expect(fileRepo.delete.called).to.equal(false);

      await service.deleteFile(makeUser(strangerId, ["admin"], []), fileId);
      expect(fileRepo.delete.calledOnceWith(fileId)).to.equal(true);
    });

    it("видимый файл без права на удаление — FILE_FORBIDDEN", async () => {
      fileRepo.findById.resolves(makeFile());

      expect(
        await codeOf(
          service.deleteFile(
            makeUser(strangerId, [], ["file:view", "file:delete:own"]),
            fileId,
          ),
        ),
      ).to.equal("FILE_FORBIDDEN");
      expect(
        await codeOf(
          service.deleteFile(makeUser(ownerId, [], ["file:view:own"]), fileId),
        ),
      ).to.equal("FILE_FORBIDDEN");
      expect(fileRepo.delete.called).to.equal(false);
    });

    it("право на удаление всех — чужой файл удаляется", async () => {
      fileRepo.findById.resolves(makeFile());

      await service.deleteFile(
        makeUser(strangerId, [], ["file:view", "file:delete"]),
        fileId,
      );

      expect(fileRepo.delete.calledOnceWith(fileId)).to.equal(true);
    });

    it("файл во вложениях — FILE_IN_USE", async () => {
      fileRepo.findById.resolves(makeFile());
      usageProbe.filesInUse.resolves([fileId]);

      expect(
        await codeOf(service.deleteFile(makeUser(ownerId), fileId)),
      ).to.equal("FILE_IN_USE");
      expect(fileRepo.delete.called).to.equal(false);
      expect(eventBus.emit.called).to.equal(false);
    });
  });

  describe("adopt", () => {
    it("снимает владельца у файлов загрузившего — дальше файл принадлежит домену", async () => {
      txRepo.find.resolves([makeFile()]);

      const files = await service.adopt(
        [fileId, fileId],
        ownerId,
        manager as any,
      );

      expect(files[0].ownerId).to.equal(null);
      expect(txRepo.update.firstCall.args[1]).to.deep.equal({ ownerId: null });
    });

    it("чужой, несуществующий или незагруженный файл — ошибка", async () => {
      txRepo.find.resolves([makeFile()]);
      expect(
        await codeOf(service.adopt([fileId], strangerId, manager as any)),
      ).to.equal("FILE_FORBIDDEN");

      txRepo.find.resolves([]);
      expect(
        await codeOf(service.adopt([fileId], ownerId, manager as any)),
      ).to.equal("FILE_NOT_FOUND");

      txRepo.find.resolves([makeFile({ status: EFileStatus.Pending })]);
      expect(
        await codeOf(service.adopt([fileId], ownerId, manager as any)),
      ).to.equal("FILE_UPLOAD_INCOMPLETE");
      expect(txRepo.update.called).to.equal(false);
    });
  });

  describe("createFromLocal", () => {
    it("оригинал — в хранилище, запись без владельца и задача обработки", async () => {
      const source = path.join(tmpDir, "frame.png");

      await fs.writeFile(source, PNG_HEADER);

      const file = await service.createFromLocal({
        path: source,
        name: "frame.png",
        type: "image/png",
      });

      expect(file).to.include({ ownerId: null, size: PNG_HEADER.length });
      expect(await storage.stat(file.key)).to.include({
        size: PNG_HEADER.length,
      });
      expect(jobs.enqueue.firstCall.args[0]).to.equal(FileQueues.process);
    });

    it("содержимое не совпало с типом — 415, в хранилище ничего не остаётся", async () => {
      const source = path.join(tmpDir, "fake.png");

      await fs.writeFile(source, PDF_HEADER);

      expect(
        await codeOf(
          service.createFromLocal({
            path: source,
            name: "fake.png",
            type: "image/png",
          }),
        ),
      ).to.equal("FILE_SIGNATURE_MISMATCH");
      expect(txRepo.save.called).to.equal(false);
    });
  });

  describe("registerStored", () => {
    it("объект по зарезервированному ключу становится файлом с размером из хранилища", async () => {
      const { fileId: id, key } = reserveFileKey("best.pdf");

      await storage.put(key, PDF_HEADER, { contentType: "application/pdf" });

      const file = await service.registerStored({
        fileId: id,
        key,
        name: "best.pdf",
        type: "application/pdf",
      });

      expect(file).to.include({
        id,
        key,
        ownerId: null,
        size: PDF_HEADER.length,
      });
    });

    it("объекта нет или ключ не от этого id — ошибка", async () => {
      const { fileId: id, key } = reserveFileKey("best.pdf");

      expect(
        await codeOf(
          service.registerStored({
            fileId: id,
            key,
            name: "best.pdf",
            type: "application/pdf",
          }),
        ),
      ).to.equal("FILE_UPLOAD_INCOMPLETE");
      expect(
        await codeOf(
          service.registerStored({
            fileId: uuid2(),
            key,
            name: "best.pdf",
            type: "application/pdf",
          }),
        ),
      ).to.equal("FILE_NOT_FOUND");
    });
  });

  describe("removal", () => {
    it("scheduleRemoval — задачи file.remove частями, в транзакции вызывающего", async () => {
      const ids = Array.from({ length: 501 }, (_, i) => `id-${i}`);

      await service.scheduleRemoval(ids, manager as any);

      expect(jobs.enqueue.callCount).to.equal(2);
      expect(jobs.enqueue.firstCall.args[0]).to.equal(FileQueues.remove);
      expect(jobs.enqueue.firstCall.args[1].fileIds).to.have.length(500);
      expect(jobs.enqueue.firstCall.args[2]).to.deep.equal({ manager });
    });

    it("removeUnused удаляет только файлы без ссылок — записи и объекты", async () => {
      const used = uuid2();

      await storage.put(`files/${fileId}/original.pdf`, PDF_HEADER, {});
      fileRepo.find = sinon.stub().resolves([{ id: fileId }, { id: used }]);
      usageProbe.filesInUse.resolves([used]);

      expect(await service.removeUnused([fileId, used])).to.equal(1);
      expect(fileRepo.delete.firstCall.args[0].id.value).to.deep.equal([
        fileId,
      ]);
      expect(await storage.stat(`files/${fileId}/original.pdf`)).to.equal(null);
    });
  });
});
