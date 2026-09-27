import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { logger } from "../../core";
import { SYNC_CLEANUP_QUEUE, SYNC_COMPACTION_QUEUE } from "./sync.types";
import { SyncCleanupJob } from "./sync-cleanup.job";
import { SyncCompactionJob } from "./sync-compaction.job";

describe("Sync jobs", () => {
  let syncService: { cleanup: sinon.SinonStub; compact: sinon.SinonStub };

  beforeEach(() => {
    syncService = {
      cleanup: sinon.stub().resolves(0),
      compact: sinon.stub().resolves(0),
    };
  });

  afterEach(() => sinon.restore());

  it("очистка и компактификация — периодические задачи по cron", () => {
    const cleanup = new SyncCleanupJob(syncService as any).definition;
    const compaction = new SyncCompactionJob(syncService as any).definition;

    expect(cleanup.queue).to.equal(SYNC_CLEANUP_QUEUE);
    expect(compaction.queue).to.equal(SYNC_COMPACTION_QUEUE);
    expect(cleanup.cron).to.be.a("string").and.not.empty;
    expect(compaction.cron).to.be.a("string").and.not.empty;
  });

  it("очистка удаляет записи старше 90 дней", async () => {
    sinon.stub(logger, "info");
    syncService.cleanup.resolves(5);

    await new SyncCleanupJob(syncService as any).handle();

    expect(syncService.cleanup.calledOnceWith(90)).to.be.true;
  });

  it("компактификация вызывает сервис", async () => {
    await new SyncCompactionJob(syncService as any).handle();

    expect(syncService.compact.calledOnce).to.be.true;
  });

  it("ошибка задачи пробрасывается в очередь (повтор, статус failed)", async () => {
    syncService.compact.rejects(new Error("db down"));

    try {
      await new SyncCompactionJob(syncService as any).handle();
      expect.fail("Should have thrown");
    } catch (err) {
      expect((err as Error).message).to.equal("db down");
    }
  });
});
