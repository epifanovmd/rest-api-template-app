import { expect } from "chai";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import { ProcessError } from "./json-lines";
import { JsonLinesWorker } from "./json-lines-worker";
import { runJsonLinesProcess } from "./process-runner";

const CHILD = path.join(__dirname, "fixtures", "json-lines-child.cjs");

const expectProcessError = async (
  promise: Promise<unknown>,
): Promise<ProcessError> => {
  try {
    await promise;
  } catch (err) {
    expect(err).to.be.instanceOf(ProcessError);

    return err as ProcessError;
  }

  return expect.fail("должно было упасть");
};

describe("runJsonLinesProcess", () => {
  it("события из stdout, результат, stderr и не-JSON — в лог", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "jl-"));
    const logFile = path.join(dir, "run.log");
    const events: unknown[] = [];
    const stderr: string[] = [];

    const { result, events: count } = await runJsonLinesProcess({
      command: process.execPath,
      args: [CHILD, "ok"],
      input: { text: "hi" },
      onEvent: event => events.push(event),
      onStderr: line => stderr.push(line),
      logFile,
    });

    expect(result).to.deep.equal({ echo: { text: "hi" } });
    expect(count).to.equal(2);
    expect(events[0]).to.deep.equal({ event: "progress", value: 0.5 });
    expect(stderr).to.deep.equal(["stderr line"]);

    const log = readFileSync(logFile, "utf8");

    expect(log).to.contain("stderr line");
    expect(log).to.contain("not json");
  });

  it("ненулевой код выхода — EXIT_CODE с хвостом stderr", async () => {
    const err = await expectProcessError(
      runJsonLinesProcess({
        command: process.execPath,
        args: [CHILD, "exit-code"],
      }),
    );

    expect(err.code).to.equal("EXIT_CODE");
    expect(err.details.exitCode).to.equal(3);
    expect(err.details.stderrTail).to.include("boom happened");
  });

  it("событие error — ошибка с кодом процесса", async () => {
    const err = await expectProcessError(
      runJsonLinesProcess({
        command: process.execPath,
        args: [CHILD, "error-event"],
      }),
    );

    expect(err.code).to.equal("BAD_INPUT");
    expect(err.message).to.equal("плохой вход");
  });

  it("нет первого события за handshakeTimeoutMs — процесс убит", async () => {
    const err = await expectProcessError(
      runJsonLinesProcess({
        command: process.execPath,
        args: [CHILD, "hang"],
        handshakeTimeoutMs: 200,
      }),
    );

    expect(err.code).to.equal("HANDSHAKE_TIMEOUT");
  });

  it("отмена сигналом: SIGTERM, а упрямому — SIGKILL", async () => {
    const controller = new AbortController();
    const promise = runJsonLinesProcess({
      command: process.execPath,
      args: [CHILD, "stubborn"],
      signal: controller.signal,
      killTimeoutMs: 200,
      onEvent: () => controller.abort(),
    });

    const err = await expectProcessError(promise);

    expect(err.code).to.equal("ABORTED");
    expect(err.details.signal).to.equal("SIGKILL");
  });

  it("несуществующая команда — SPAWN_FAILED", async () => {
    const err = await expectProcessError(
      runJsonLinesProcess({ command: "/nonexistent/binary-xyz" }),
    );

    expect(err.code).to.equal("SPAWN_FAILED");
  });

  it("уже отменённый сигнал — процесс не запускается", async () => {
    const controller = new AbortController();

    controller.abort();

    const err = await expectProcessError(
      runJsonLinesProcess({
        command: process.execPath,
        args: [CHILD, "ok"],
        signal: controller.signal,
      }),
    );

    expect(err.code).to.equal("ABORTED");
  });
});

describe("JsonLinesWorker", () => {
  let worker: JsonLinesWorker;

  const create = (mode = "worker", extra = {}) =>
    new JsonLinesWorker({
      command: process.execPath,
      args: [CHILD, mode],
      handshakeTask: "hello",
      handshakeTimeoutMs: 2_000,
      killTimeoutMs: 500,
      ...extra,
    });

  afterEach(async () => {
    await worker?.stop();
  });

  it("рукопожатие и запросы по id", async () => {
    worker = create();

    const [a, b] = await Promise.all([
      worker.request("echo", { n: 1 }),
      worker.request("echo", { n: 2 }),
    ]);

    expect(worker.state).to.equal("ready");
    expect(worker.info).to.have.property("pid");
    expect(a).to.deep.equal({ n: 1 });
    expect(b).to.deep.equal({ n: 2 });
  });

  it("параллельность: запросы сверх concurrency ждут очереди", async () => {
    worker = create("worker", { concurrency: 2 });
    await worker.start();

    const started = Date.now();
    const results = await Promise.all(
      [1, 2, 3, 4].map(n => worker.request("slow", { n, ms: 150 })),
    );

    expect(results).to.have.length(4);
    // 4 запроса по 150 мс в 2 слота — примерно 300 мс, не 150 и не 600.
    expect(Date.now() - started).to.be.within(280, 550);
  });

  it("прогресс и ошибка задачи", async () => {
    worker = create();

    const progress: number[] = [];

    await worker.request(
      "slow",
      { ms: 10 },
      { onProgress: v => progress.push(v) },
    );
    expect(progress).to.deep.equal([0.5]);

    const err = await expectProcessError(worker.request("boom"));

    expect(err.code).to.equal("BOOM");
  });

  it("отмена запроса отправляет cancel процессу", async () => {
    worker = create();
    await worker.start();

    const controller = new AbortController();
    const promise = worker.request(
      "slow",
      { ms: 300 },
      { signal: controller.signal },
    );

    setTimeout(() => controller.abort(), 20);

    const err = await expectProcessError(promise);

    expect(err.code).to.equal("ABORTED");
    // Процесс жив и обслуживает следующие запросы.
    expect(await worker.request("echo", { ok: true })).to.deep.equal({
      ok: true,
    });
  });

  it("падение процесса: ожидающие получают ошибку, следующий запрос поднимает новый", async () => {
    let exits = 0;

    worker = create("worker", { onExit: () => (exits += 1) });

    const first = (await worker.start(), worker.info) as { pid: number };
    const err = await expectProcessError(worker.request("crash"));

    expect(err.code).to.equal("EXIT_CODE");
    expect(exits).to.equal(1);

    await worker.request("echo", {});
    expect((worker.info as { pid: number }).pid).to.not.equal(first.pid);
  });

  it("молчащий процесс — HANDSHAKE_TIMEOUT", async () => {
    worker = create("worker-silent", { handshakeTimeoutMs: 200 });

    const err = await expectProcessError(worker.request("echo", {}));

    expect(err.code).to.equal("HANDSHAKE_TIMEOUT");
  });

  it("stop отклоняет ждущие запросы", async () => {
    worker = create();
    await worker.start();

    const caught = expectProcessError(worker.request("slow", { ms: 1_000 }));

    await worker.stop();

    const err = await caught;

    expect(err.code).to.equal("WORKER_STOPPED");
    expect(worker.state).to.equal("stopped");
  });
});
