import type { Agent, ConfigStatus } from "agent-sdk/server";
import { expect } from "chai";

import { agentAlerts, AgentAlertTracker } from "./agent-alerts";

const agent = (patch: Partial<Agent> = {}): Agent => ({
  id: "a1",
  name: "node-1",
  labels: {},
  online: true,
  revoked: false,
  enrolledAt: 1,
  workers: [],
  ...patch,
});

const status = (workers: unknown[]): Pick<Agent, "status" | "statusAt"> => ({
  status: { workers } as Agent["status"],
  statusAt: 500,
});

const failed: ConfigStatus = {
  agentId: "a1",
  worker: "echo",
  key: "settings",
  version: 3,
  delivered: 3,
  state: "failed",
  error: { code: "CONFIG_REJECTED", message: "плохое значение" },
  updatedAt: 700,
};

describe("agentAlerts: проблемы агента", () => {
  it("без связи — offline с последней вести", () => {
    expect(
      agentAlerts(
        agent({ online: false, lastSeenAt: 300 }),
        [],
        undefined,
        900,
      ),
    ).to.deep.equal([
      {
        agentId: "a1",
        agentName: "node-1",
        key: "offline",
        type: "offline",
        message: "агент без связи",
        since: 300,
      },
    ]);
  });

  it("воркеры: не работает, не зарегистрирован, плохое самочувствие; настройки не применены", () => {
    const alerts = agentAlerts(
      agent(
        status([
          { name: "a", state: "backoff", restarts: 2 },
          { name: "b", state: "invalid", message: "нет /health" },
          { name: "c", state: "running", health: { ok: false } },
          { name: "d", state: "running", health: { ok: true } },
        ]),
      ),
      [failed, { ...failed, key: "other", state: "applied" }],
      undefined,
      900,
    );

    expect(alerts.map(a => [a.key, a.type, a.message, a.since])).to.deep.equal([
      [
        "workerDown:a",
        "workerDown",
        "воркер a не работает (backoff, перезапусков: 2)",
        500,
      ],
      [
        "workerInvalid:b",
        "workerInvalid",
        "воркер b не зарегистрирован: нет /health",
        500,
      ],
      [
        "workerUnhealthy:c",
        "workerUnhealthy",
        "воркер c: плохое самочувствие",
        500,
      ],
      [
        "configFailed:echo/settings",
        "configFailed",
        "настройки echo/settings версии 3 не применены: плохое значение",
        700,
      ],
    ]);
    expect(alerts[3]).to.include({ worker: "echo", configKey: "settings" });
  });

  it("отозванный агент — без проблем; известное начало проблемы сохраняется", () => {
    expect(
      agentAlerts(agent({ revoked: true, online: false }), [failed]),
    ).to.deep.equal([]);
    expect(
      agentAlerts(
        agent({ online: false, lastSeenAt: 300 }),
        [],
        new Map([["offline", 100]]),
      )[0].since,
    ).to.equal(100);
  });
});

describe("AgentAlertTracker: начавшиеся и закончившиеся проблемы", () => {
  it("сообщает только изменения; удалённый агент — все закончились", () => {
    const tracker = new AgentAlertTracker();
    const offline = agentAlerts(agent({ online: false, lastSeenAt: 300 }), []);

    expect(
      tracker.update("a1", offline).map(c => [c.key, c.active]),
    ).to.deep.equal([["offline", true]]);
    expect(tracker.update("a1", offline)).to.deep.equal([]);
    expect(tracker.known("a1").get("offline")).to.equal(300);
    expect(tracker.update("a1", []).map(c => [c.key, c.active])).to.deep.equal([
      ["offline", false],
    ]);
    tracker.update("a1", offline);
    expect(tracker.forget("a1").map(c => c.active)).to.deep.equal([false]);
    expect(tracker.known("a1").size).to.equal(0);
  });
});
