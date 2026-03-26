import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { SyncService } from "./sync.service";
import { ESyncAction, ESyncEntityType } from "./sync.types";

describe("SyncService", () => {
  let service: SyncService;
  let syncLogRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const chatId = uuid2();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    syncLogRepo = createMockRepository();
    memberRepo = createMockRepository();

    (syncLogRepo as any).getChangesSince = sinon.stub().resolves({
      changes: [],
      hasMore: false,
    });

    service = new SyncService(syncLogRepo as any, memberRepo as any);
  });

  afterEach(() => sandbox.restore());

  describe("getChanges", () => {
    it("should return changes since a given version", async () => {
      const memberships = [{ chatId }];
      const changes = [
        {
          version: "5",
          entityType: ESyncEntityType.MESSAGE,
          entityId: "msg-1",
          action: ESyncAction.CREATE,
          chatId,
          payload: null,
          createdAt: new Date(),
        },
      ];

      memberRepo.find.resolves(memberships);
      (syncLogRepo as any).getChangesSince.resolves({ changes, hasMore: false });

      const result = await service.getChanges(userId, "3", 100);

      expect(memberRepo.find.calledOnce).to.be.true;
      expect((syncLogRepo as any).getChangesSince.calledOnce).to.be.true;

      const [uId, chatIds, sinceVersion, limit] =
        (syncLogRepo as any).getChangesSince.firstCall.args;

      expect(uId).to.equal(userId);
      expect(chatIds).to.deep.equal([chatId]);
      expect(sinceVersion).to.equal("3");
      expect(limit).to.equal(100);

      expect(result.changes).to.have.length(1);
      expect(result.currentVersion).to.equal("5");
      expect(result.hasMore).to.be.false;
    });

    it("should return empty result when user has no memberships", async () => {
      memberRepo.find.resolves([]);
      (syncLogRepo as any).getChangesSince.resolves({ changes: [], hasMore: false });

      const result = await service.getChanges(userId);

      expect(result.changes).to.have.length(0);
      expect(result.currentVersion).to.equal("0");
      expect(result.hasMore).to.be.false;
    });

    it("should use default limit when not provided", async () => {
      memberRepo.find.resolves([]);
      (syncLogRepo as any).getChangesSince.resolves({ changes: [], hasMore: false });

      await service.getChanges(userId, "1");

      const limit = (syncLogRepo as any).getChangesSince.firstCall.args[3];

      expect(limit).to.equal(100);
    });
  });

  describe("logChange", () => {
    it("should create a sync log entry", async () => {
      syncLogRepo.createAndSave.resolves({});

      await service.logChange(ESyncEntityType.MESSAGE, "msg-1", ESyncAction.CREATE, {
        userId,
        chatId,
        payload: { content: "hello" },
      });

      expect(syncLogRepo.createAndSave.calledOnce).to.be.true;
      const savedData = syncLogRepo.createAndSave.firstCall.args[0];

      expect(savedData.entityType).to.equal(ESyncEntityType.MESSAGE);
      expect(savedData.entityId).to.equal("msg-1");
      expect(savedData.action).to.equal(ESyncAction.CREATE);
      expect(savedData.userId).to.equal(userId);
      expect(savedData.chatId).to.equal(chatId);
      expect(savedData.payload).to.deep.equal({ content: "hello" });
    });

    it("should default optional fields to null", async () => {
      syncLogRepo.createAndSave.resolves({});

      await service.logChange(ESyncEntityType.CHAT, "chat-1", ESyncAction.UPDATE);

      const savedData = syncLogRepo.createAndSave.firstCall.args[0];

      expect(savedData.userId).to.be.null;
      expect(savedData.chatId).to.be.null;
      expect(savedData.payload).to.be.null;
    });
  });
});
