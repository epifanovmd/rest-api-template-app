import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { FILE_GC_BATCH, FILE_GC_GRACE_MS } from "./file.types";
import { FileGcJob } from "./file-gc.job";

const ctx = (aborted = false) => ({ signal: { aborted } }) as any;

describe("FileGcJob", () => {
  it("проходит бесхозные файлы пачками по id и удаляет неиспользуемые", async () => {
    const full = Array.from({ length: FILE_GC_BATCH }, (_, i) => ({
      id: `a-${i}`,
    }));
    const repo = {
      findOrphans: sinon
        .stub()
        .onFirstCall()
        .resolves(full)
        .onSecondCall()
        .resolves([{ id: "b-0" }]),
    };
    const files = { removeUnused: sinon.stub().resolves(2) };
    const job = new FileGcJob(repo as any, files as any);

    expect(await job.handle(ctx())).to.equal(4);

    const [before, afterId] = repo.findOrphans.firstCall.args;

    expect(Date.now() - before.getTime()).to.be.closeTo(
      FILE_GC_GRACE_MS,
      1_000,
    );
    expect(afterId).to.equal(null);
    expect(repo.findOrphans.secondCall.args[1]).to.equal(
      `a-${FILE_GC_BATCH - 1}`,
    );
    expect(repo.findOrphans.callCount).to.equal(2);
  });

  it("остановка процесса прерывает проход", async () => {
    const repo = { findOrphans: sinon.stub().resolves([]) };
    const job = new FileGcJob(
      repo as any,
      { removeUnused: sinon.stub() } as any,
    );

    expect(await job.handle(ctx(true))).to.equal(0);
    expect(repo.findOrphans.called).to.equal(false);
  });
});
