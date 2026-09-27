import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockFileStorage } from "../../test/helpers";
import { PENDING_UPLOAD_TTL_MS } from "./file.types";
import { FileCleanupJob } from "./file-cleanup.job";

describe("FileCleanupJob", () => {
  it("удаляет неподтверждённые загрузки старше суток вместе с объектами", async () => {
    const files = {
      findStalePending: sinon.stub().resolves([{ id: "f1" }, { id: "f2" }]),
      delete: sinon.stub().resolves({ affected: 1 }),
    };
    const storage = createMockFileStorage();
    const job = new FileCleanupJob(files as any, storage as any);
    const before = Date.now();

    expect(await job.handle()).to.deep.equal({ removed: 2 });

    const threshold = files.findStalePending.firstCall.args[0] as Date;

    expect(threshold.getTime()).to.be.at.most(
      before - PENDING_UPLOAD_TTL_MS + 1000,
    );
    expect(storage.deletePrefix.args.map(a => a[0])).to.deep.equal([
      "files/f1/",
      "files/f2/",
    ]);
    expect(files.delete.args.map(a => a[0])).to.deep.equal(["f1", "f2"]);
    expect(job.definition).to.include({ queue: "file.cleanup-pending" });
    expect(job.definition.cron).to.be.a("string");
  });
});
