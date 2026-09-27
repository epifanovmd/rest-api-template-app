import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { HttpException } from "../../core/http";
import { createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { SyncService } from "./sync.service";
import { ESyncAction, ESyncEntityType } from "./sync.types";

describe("SyncService", () => {
  let service: SyncService;
  let syncLogRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let emitter: {
    toUser: sinon.SinonStub;
    toRoom: sinon.SinonStub;
    broadcast: sinon.SinonStub;
  };
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const chatId = uuid2();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    syncLogRepo = createMockRepository();
    memberRepo = createMockRepository();

    (syncLogRepo as any).getCompactedChangesSince = sinon.stub().resolves({
      changes: [],
      hasMore: false,
    });
    (syncLogRepo as any).getLatestVersion = sinon.stub().resolves("100");
    (syncLogRepo as any).getVersionState = sinon
      .stub()
      .resolves({ watermark: "0", latest: "100" });
    (syncLogRepo as any).deleteOlderVersions = sinon.stub().resolves(0);
    (memberRepo as any).getUserChatIds = sinon.stub().resolves([]);

    emitter = {
      toUser: sinon.stub(),
      toRoom: sinon.stub(),
      broadcast: sinon.stub(),
    };

    service = new SyncService(
      syncLogRepo as any,
      memberRepo as any,
      emitter as any,
    );
  });

  afterEach(() => sandbox.restore());

  describe("getChanges", () => {
    it("should return changes since a given version", async () => {
      const changes = [
        {
          version: "5",
          entityType: ESyncEntityType.MESSAGE,
          entityId: "msg-1",
          entityKey: "message:msg-1",
          action: ESyncAction.CREATE,
          userId: null,
          scopeId: chatId,
          payload: null,
          createdAt: new Date(),
        },
      ];

      (memberRepo as any).getUserChatIds.resolves([chatId]);
      (syncLogRepo as any).getCompactedChangesSince.resolves({
        changes,
        hasMore: false,
      });

      const result = await service.getChanges(userId, "3", 100);

      expect((memberRepo as any).getUserChatIds.calledOnceWith(userId)).to.be
        .true;
      expect((syncLogRepo as any).getCompactedChangesSince.calledOnce).to.be
        .true;

      const [uId, scopeIds, sinceVersion, limit] = (syncLogRepo as any)
        .getCompactedChangesSince.firstCall.args;

      expect(uId).to.equal(userId);
      expect(scopeIds).to.deep.equal([chatId]);
      expect(sinceVersion).to.equal("3");
      expect(limit).to.equal(100);

      expect(result.changes).to.have.length(1);
      expect(result.changes[0].scopeId).to.equal(chatId);
      expect(result.currentVersion).to.equal("5");
      expect(result.hasMore).to.be.false;
      expect(result.requiresSnapshot).to.be.false;
    });

    it("should return empty result when user has no memberships", async () => {
      const result = await service.getChanges(userId);

      expect(result.changes).to.have.length(0);
      expect(result.currentVersion).to.equal("100"); // latest version from DB
      expect(result.hasMore).to.be.false;
      // Без sinceVersion диапазон версий не проверяется
      expect((syncLogRepo as any).getVersionState.called).to.be.false;
    });

    it("should use default limit when not provided", async () => {
      await service.getChanges(userId, "1");

      const limit = (syncLogRepo as any).getCompactedChangesSince.firstCall
        .args[3];

      expect(limit).to.equal(100);
    });

    it("should cap the limit at 500", async () => {
      await service.getChanges(userId, undefined, 10_000);

      expect(
        (syncLogRepo as any).getCompactedChangesSince.firstCall.args[3],
      ).to.equal(500);
    });

    it("требует snapshot, если версия клиента ниже watermark retention", async () => {
      (syncLogRepo as any).getVersionState.resolves({
        watermark: "50",
        latest: "100",
      });

      const result = await service.getChanges(userId, "3");

      expect(result.requiresSnapshot).to.be.true;
      expect(result.currentVersion).to.equal("100");
      expect((syncLogRepo as any).getCompactedChangesSince.called).to.be.false;
    });

    it("не требует snapshot на границе watermark (всё после неё сохранено)", async () => {
      (syncLogRepo as any).getVersionState.resolves({
        watermark: "50",
        latest: "100",
      });

      const result = await service.getChanges(userId, "50");

      expect(result.requiresSnapshot).to.be.false;
      expect((syncLogRepo as any).getCompactedChangesSince.calledOnce).to.be
        .true;
    });

    it("не требует snapshot из-за компактизации: важен watermark, а не MIN(version)", async () => {
      // Старые версии удалены компактизацией, retention ничего не удалял
      (syncLogRepo as any).getVersionState.resolves({
        watermark: "0",
        latest: "100",
      });

      const result = await service.getChanges(userId, "3");

      expect(result.requiresSnapshot).to.be.false;
    });

    it("требует snapshot, если версия клиента впереди журнала", async () => {
      const result = await service.getChanges(userId, "500");

      expect(result.requiresSnapshot).to.be.true;
      expect(result.changes).to.have.length(0);
    });

    for (const bad of ["abc", "-1", "1.5", "1e3", " 1", "0x10"]) {
      it(`400 для некорректного sinceVersion «${bad}»`, async () => {
        try {
          await service.getChanges(userId, bad);
          expect.fail("Should have thrown");
        } catch (err) {
          expect(err).to.be.instanceOf(HttpException);
          expect(err).to.include({
            status: 400,
            code: "SYNC_INVALID_VERSION",
          });
        }
      });
    }

    it("ограничивает limit снизу единицей", async () => {
      await service.getChanges(userId, undefined, -5);

      expect(
        (syncLogRepo as any).getCompactedChangesSince.firstCall.args[3],
      ).to.equal(1);
    });
  });

  describe("logChange", () => {
    it("should create a scope-scoped sync log entry and compact older versions", async () => {
      syncLogRepo.createAndSave.resolves({ version: "7" });

      await service.logChange(
        ESyncEntityType.MESSAGE,
        "msg-1",
        ESyncAction.CREATE,
        {
          scopeId: chatId,
          payload: { content: "hello" },
          notifyUserIds: [userId],
        },
      );

      expect(syncLogRepo.createAndSave.calledOnce).to.be.true;
      const savedData = syncLogRepo.createAndSave.firstCall.args[0];

      expect(savedData.entityType).to.equal(ESyncEntityType.MESSAGE);
      expect(savedData.entityId).to.equal("msg-1");
      expect(savedData.entityKey).to.equal("message:msg-1");
      expect(savedData.action).to.equal(ESyncAction.CREATE);
      expect(savedData.userId).to.be.null;
      expect(savedData.scopeId).to.equal(chatId);
      expect(savedData.payload).to.deep.equal({ content: "hello" });

      // Write-time compaction: старые версии этого entity_key удаляются
      expect(
        (syncLogRepo as any).deleteOlderVersions.calledOnceWith(
          "message:msg-1",
          "7",
        ),
      ).to.be.true;
      expect(
        emitter.toUser.calledOnceWith(userId, "sync:available", {
          version: "7",
        }),
      ).to.be.true;
    });

    it("should default optional fields to null for a user-scoped entry", async () => {
      syncLogRepo.createAndSave.resolves({ version: "8" });

      await service.logChange(
        ESyncEntityType.CHAT,
        "chat-1",
        ESyncAction.UPDATE,
        {
          userId,
        },
      );

      const savedData = syncLogRepo.createAndSave.firstCall.args[0];

      expect(savedData.userId).to.equal(userId);
      expect(savedData.scopeId).to.be.null;
      expect(savedData.payload).to.be.null;
    });

    it("user-scoped ключ включает пользователя: компактизация не трогает чужие записи", async () => {
      syncLogRepo.createAndSave.resolves({ version: "9" });

      await service.logChange(
        ESyncEntityType.CHAT,
        chatId,
        ESyncAction.DELETE,
        {
          userId,
        },
      );

      const savedData = syncLogRepo.createAndSave.firstCall.args[0];

      expect(savedData.entityKey).to.equal(`chat:${chatId}@${userId}`);
      expect(
        (syncLogRepo as any).deleteOlderVersions.calledOnceWith(
          `chat:${chatId}@${userId}`,
          "9",
        ),
      ).to.be.true;
    });

    it("should reject an entry without userId and scopeId (broadcast is not allowed)", async () => {
      await service.logChange(
        ESyncEntityType.CHAT,
        "chat-1",
        ESyncAction.UPDATE,
      );

      expect(syncLogRepo.createAndSave.called).to.be.false;
    });

    it("should reject an entry with both userId and scopeId (ambiguous scope)", async () => {
      await service.logChange(
        ESyncEntityType.CHAT,
        "chat-1",
        ESyncAction.UPDATE,
        {
          userId,
          scopeId: chatId,
        },
      );

      expect(syncLogRepo.createAndSave.called).to.be.false;
    });
  });

  describe("обслуживание журнала", () => {
    it("cleanup удаляет записи старше срока хранения", async () => {
      (syncLogRepo as any).deleteOlderThan = sinon.stub().resolves(3);

      const deleted = await service.cleanup(90);
      const before: Date = (syncLogRepo as any).deleteOlderThan.firstCall
        .args[0];
      const days = (Date.now() - before.getTime()) / (24 * 60 * 60 * 1000);

      expect(deleted).to.equal(3);
      expect(Math.round(days)).to.equal(90);
    });

    it("compact пробрасывает ошибку — её фиксирует очередь задач", async () => {
      (syncLogRepo as any).compactDuplicates = sinon
        .stub()
        .rejects(new Error("db down"));

      try {
        await service.compact();
        expect.fail("Should have thrown");
      } catch (err) {
        expect((err as Error).message).to.equal("db down");
      }
    });
  });
});
