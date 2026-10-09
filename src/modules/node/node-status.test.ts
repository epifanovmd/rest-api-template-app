import { expect } from "chai";

import { EJobRunStatus } from "../jobs";
import { ENodeConfigStatus, ENodeJobKind, ENodeStatus } from "./node.types";
import { configSummary, nodeStatus } from "./node-status";

const agent = (patch: Record<string, unknown> = {}): any => ({
  id: "a1",
  name: "a1",
  labels: {},
  online: true,
  revoked: false,
  enrolledAt: 1,
  workers: [
    { name: "sysmetrics", builtin: true, state: "running" },
    { name: "netprobe", state: "running", health: { ok: true } },
  ],
  alerts: [],
  ...patch,
});

const config = (key: string, state: string, patch: object = {}): any => ({
  agentId: "a1",
  worker: "netprobe",
  key,
  version: 1,
  state,
  ...patch,
});

const job = (status: EJobRunStatus, kind = ENodeJobKind.Install) => ({
  kind,
  status,
  progressText: null,
  error:
    status === EJobRunStatus.FAILED
      ? { code: "NODE_SSH_STEP_FAILED", message: "Установка агента: код 1" }
      : null,
});

describe("nodeStatus", () => {
  it("идёт задача — provisioning, даже если агент на связи", () => {
    expect(nodeStatus(agent(), job(EJobRunStatus.RUNNING)).status).to.equal(
      ENodeStatus.Provisioning,
    );
    expect(
      nodeStatus(null, job(EJobRunStatus.QUEUED, ENodeJobKind.Uninstall)),
    ).to.deep.equal({
      status: ENodeStatus.Provisioning,
      message: "Удаление агента",
    });
  });

  it("агента нет: провал задачи — error с текстом, иначе created", () => {
    expect(nodeStatus(null, job(EJobRunStatus.FAILED))).to.deep.equal({
      status: ENodeStatus.Error,
      message: "Установка агента: код 1",
    });
    expect(nodeStatus(null, job(EJobRunStatus.CANCELLED)).status).to.equal(
      ENodeStatus.Error,
    );
    expect(nodeStatus(null, null)).to.deep.equal({
      status: ENodeStatus.Created,
      message: "Ожидает агента",
    });
    expect(nodeStatus(null, job(EJobRunStatus.COMPLETED)).status).to.equal(
      ENodeStatus.Created,
    );
  });

  it("агент: не на связи — offline; провал прошлой задачи не важен", () => {
    expect(
      nodeStatus(agent({ online: false }), job(EJobRunStatus.FAILED)).status,
    ).to.equal(ENodeStatus.Offline);
    expect(nodeStatus(agent(), null).status).to.equal(ENodeStatus.Online);
  });

  it("воркер invalid, упал, не в порядке или отказал в настройке — error", () => {
    const withWorker = (worker: object) =>
      nodeStatus(agent({ workers: [{ name: "echo", ...worker }] }), null);

    expect(
      withWorker({ state: "invalid", message: "GET /manifest: HTTP 404" }),
    ).to.deep.equal({
      status: ENodeStatus.Error,
      message: "Воркер echo не зарегистрирован: GET /manifest: HTTP 404",
    });
    expect(withWorker({ state: "backoff" }).status).to.equal(ENodeStatus.Error);
    expect(
      withWorker({ state: "running", health: { ok: false, message: "диск" } }),
    ).to.deep.equal({
      status: ENodeStatus.Error,
      message: "Воркер echo: диск",
    });
    expect(
      withWorker({
        state: "running",
        configs: {
          settings: {
            version: 2,
            ok: false,
            error: { code: "CONFIG_REJECTED", message: "prefix: строка" },
          },
        },
      }).message,
    ).to.equal("Воркер echo, настройка settings: prefix: строка");
  });

  it("статус настроек failed (в том числе не доставленная) — error", () => {
    expect(
      nodeStatus(agent(), null, [
        config("targets", "failed", {
          error: { code: "WORKER_UNKNOWN", message: "нет воркера" },
        }),
      ]),
    ).to.deep.equal({
      status: ENodeStatus.Error,
      message: "Настройка netprobe/targets: нет воркера",
    });
  });
});

describe("configSummary", () => {
  it("всё применено — synced; ждёт — applying, без связи — awaitingAgent", () => {
    expect(
      configSummary(agent(), [config("targets", "applied")]).status,
    ).to.equal(ENodeConfigStatus.Synced);
    expect(
      configSummary(agent(), [
        config("targets", "applied"),
        config("limits", "applying"),
      ]),
    ).to.deep.equal({
      status: ENodeConfigStatus.Applying,
      pending: ["netprobe/limits"],
      failed: [],
    });
    expect(
      configSummary(agent({ online: false }), [config("targets", "pending")])
        .status,
    ).to.equal(ENodeConfigStatus.AwaitingAgent);
  });

  it("отказ — error; агента нет — awaitingAgent", () => {
    expect(configSummary(agent(), [config("targets", "failed")])).to.deep.equal(
      {
        status: ENodeConfigStatus.Error,
        pending: [],
        failed: ["netprobe/targets"],
      },
    );
    expect(configSummary(null, []).status).to.equal(
      ENodeConfigStatus.AwaitingAgent,
    );
  });
});
