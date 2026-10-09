import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { JobRunViews } from "./job-run.views";
import { EJobRunStatus } from "./jobs.types";

const run = (patch: object = {}) =>
  ({
    id: "r1",
    queue: "demo.echo",
    status: EJobRunStatus.COMPLETED,
    title: "t",
    progress: 1,
    progressText: null,
    logTail: [],
    result: null,
    error: null,
    ownerId: null,
    scopeType: null,
    scopeId: null,
    attempt: 0,
    cancelRequested: false,
    agentId: "a1",
    worker: "echo",
    jobType: "echo.long",
    outputs: null,
    deadlineAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date(),
    ...patch,
  }) as any;

describe("JobRunViews", () => {
  it("файлы итога — подписанные ссылки на скачивание со сроком и размером", async () => {
    const storage = {
      signedGetUrl: sinon
        .stub()
        .callsFake(async (key: string) => `https://s3/${key}`),
    };
    const views = new JobRunViews(storage as any);
    const dto = await views.toDto(
      run({
        outputs: [
          { name: "result", key: "jobs/r1/echo.txt", size: 9 },
          { name: "log", key: "jobs/r1/log.txt", size: null },
        ],
      }),
    );

    expect(dto.jobType).to.equal("echo.long");
    expect(dto.worker).to.equal("echo");
    expect(dto.outputs!.map(({ expiresAt: _, ...o }) => o)).to.deep.equal([
      { name: "result", url: "https://s3/jobs/r1/echo.txt", size: 9 },
      { name: "log", url: "https://s3/jobs/r1/log.txt" },
    ]);
    expect(dto.outputs![0].expiresAt.getTime()).to.be.greaterThan(Date.now());
    expect(storage.signedGetUrl.firstCall.args[1]).to.deep.include({
      downloadName: "echo.txt",
    });
  });

  it("без файлов, без хранилища или подпись упала — outputs: null", async () => {
    const failing = { signedGetUrl: sinon.stub().rejects(new Error("s3")) };
    const withOutput = run({
      outputs: [{ name: "result", key: "k", size: 1 }],
    });

    expect((await new JobRunViews().toDto(withOutput)).outputs).to.equal(null);
    expect(
      (await new JobRunViews(failing as any).toDto(withOutput)).outputs,
    ).to.equal(null);
    expect(
      (await new JobRunViews(failing as any).toDto(run())).outputs,
    ).to.equal(null);
  });
});
