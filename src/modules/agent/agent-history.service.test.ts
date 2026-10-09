import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { agentConfig } from "./agent.config";
import { AgentHistoryService } from "./agent-history.service";

describe("AgentHistoryService", () => {
  const point = (at: number) => ({
    agentId: "a1",
    at,
    collectedAt: at,
    host: { cpuPercent: 1 },
  });

  it("метрики: не чаще интервала; досылка после разрыва сохраняется", async () => {
    const metrics = { insert: sinon.stub().resolves() };
    const history = new AgentHistoryService({} as any, metrics as any);
    const every = agentConfig.metricsStoreIntervalMs;

    expect(await history.saveMetrics(point(100_000))).to.equal(true);
    expect(await history.saveMetrics(point(100_000 + every - 1))).to.equal(
      false,
    );
    expect(await history.saveMetrics(point(100_000 + every))).to.equal(true);
    expect(await history.saveMetrics(point(50_000))).to.equal(true);
    expect(metrics.insert.callCount).to.equal(3);
  });

  it("событие: повтор доставки (тот же id) не сохраняется дважды", async () => {
    const events = {
      create: (value: object) => value,
      insertIfNew: sinon
        .stub()
        .onFirstCall()
        .resolves(true)
        .onSecondCall()
        .resolves(false),
    };
    const history = new AgentHistoryService(events as any, {} as any);
    const event = {
      id: "m1",
      agentId: "a1",
      worker: "echo",
      type: "echo.done",
      data: { text: "a\u0000b" },
      at: 1,
      receivedAt: 2,
    };

    expect(await history.saveEvent(event)).to.equal(true);
    expect(await history.saveEvent(event)).to.equal(false);
    expect(events.insertIfNew.firstCall.args[0].data).to.deep.equal({
      text: "ab",
    });
  });

  it("лента: курсор — последняя запись страницы", async () => {
    const rows = [
      {
        id: "m2",
        agentId: "a1",
        worker: "echo",
        type: "t",
        data: null,
        at: 1,
        receivedAt: 20,
      },
      {
        id: "m1",
        agentId: "a1",
        worker: "echo",
        type: "t",
        data: null,
        at: 1,
        receivedAt: 10,
      },
    ];
    const events = { findFeed: sinon.stub().resolves(rows) };
    const history = new AgentHistoryService(events as any, {} as any);
    const page = await history.eventFeed({ limit: 2 });

    expect(page.items.map(e => e.id)).to.deep.equal(["m2", "m1"]);
    expect(page.nextCursor).to.be.a("string");

    await history.eventFeed({ limit: 2, cursor: page.nextCursor as string });
    expect(events.findFeed.secondCall.args[0].before).to.deep.equal({
      receivedAt: 10,
      id: "m1",
    });
  });
});
