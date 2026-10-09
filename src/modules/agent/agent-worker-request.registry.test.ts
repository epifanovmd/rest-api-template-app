import "reflect-metadata";

import { AgentsError, type WorkerRequest } from "agent-sdk/server";
import { expect } from "chai";
import sinon from "sinon";

import {
  IWorkerRequestHandler,
  logger,
  WorkerRequestError,
  WorkerRequestInfo,
} from "../../core";
import { AgentWorkerRequestRegistry } from "./agent-worker-request.registry";

const request = (patch: Partial<WorkerRequest> = {}): WorkerRequest =>
  ({
    id: "r1",
    agentId: "a1",
    worker: "echo",
    type: "echo.lookup",
    data: { text: "hi" },
    agent: { id: "a1", name: "node-1", labels: { zone: "z" } },
    timeoutMs: 5000,
    signal: new AbortController().signal,
    ...patch,
  }) as WorkerRequest;

const handler = (
  handle: (r: WorkerRequestInfo) => Promise<unknown>,
  patch: Partial<IWorkerRequestHandler> = {},
): IWorkerRequestHandler => ({ type: "echo.lookup", handle, ...patch });

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => expect.fail("должно было упасть"),
    (err: AgentsError) => [err.code, err.status, err.message],
  );

describe("AgentWorkerRequestRegistry", () => {
  afterEach(() => sinon.restore());

  it("ответ — результат обработчика типа; обработчик видит агента, воркер и data", async () => {
    const registry = new AgentWorkerRequestRegistry();
    let seen: WorkerRequestInfo | undefined;

    registry.register([
      handler(async r => {
        seen = r;

        return { prefix: "> " };
      }),
    ]);

    expect(await registry.handle(request())).to.deep.equal({ prefix: "> " });
    expect(seen).to.deep.include({
      worker: "echo",
      type: "echo.lookup",
      data: { text: "hi" },
      agent: { id: "a1", name: "node-1", labels: { zone: "z" } },
    });
    expect(registry.types).to.deep.equal(["echo.lookup"]);
  });

  it("тип зарегистрирован дважды — ошибка регистрации", () => {
    const registry = new AgentWorkerRequestRegistry();
    const one = handler(async () => null);

    expect(() => registry.register([one, one])).to.throw(/дважды/);
  });

  it("нет обработчика — REQUEST_UNHANDLED; воркер не из workers — REQUEST_FORBIDDEN", async () => {
    const registry = new AgentWorkerRequestRegistry();

    registry.register([handler(async () => null, { workers: ["other"] })]);

    expect(
      (await refusal(registry.handle(request({ type: "x.y" }))))[0],
    ).to.equal("REQUEST_UNHANDLED");
    expect((await refusal(registry.handle(request())))[0]).to.equal(
      "REQUEST_FORBIDDEN",
    );
  });

  it("отказ обработчика — его код (422); сбой — REQUEST_FAILED без подробностей", async () => {
    const registry = new AgentWorkerRequestRegistry();
    const logged = sinon.stub(logger, "error");

    registry.register([
      handler(async r => {
        if (r.worker === "echo") throw new WorkerRequestError("NOPE", "нельзя");
        throw new Error("секрет: строка подключения");
      }),
    ]);

    expect(await refusal(registry.handle(request()))).to.deep.equal([
      "NOPE",
      422,
      "нельзя",
    ]);

    const [code, status, message] = await refusal(
      registry.handle(request({ worker: "other" })),
    );

    expect([code, status]).to.deep.equal(["REQUEST_FAILED", 500]);
    expect(message).to.not.include("секрет");
    expect(logged.calledOnce, "подробности — в журнал").to.equal(true);
  });
});
