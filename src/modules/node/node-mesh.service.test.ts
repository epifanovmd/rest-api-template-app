import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { NETPROBE } from "./node.types";
import {
  meshOf,
  netprobeSpec,
  nodeMeshCells,
  NodeMeshService,
} from "./node-mesh.service";

const nodes = [
  { id: "n1", name: "A", host: "10.0.0.1", agentId: "a1" },
  { id: "n2", name: "B", host: "10.0.0.2", agentId: "a2" },
  { id: "n3", name: "C", host: null, agentId: "a3" },
  { id: "n4", name: "D", host: "10.0.0.4", agentId: null },
];

const result = (id: string, patch: object = {}) => ({
  id,
  host: "x",
  method: "icmp",
  sent: 3,
  received: 3,
  lossPct: 0,
  rttMinMs: 1,
  rttAvgMs: 1.5,
  rttMaxMs: 2,
  ...patch,
});

const agentWith = (
  id: string,
  results: object[],
  patch: Record<string, unknown> = {},
): any => ({
  id,
  online: true,
  revoked: false,
  workers: [{ name: "netprobe", state: "running" }],
  metrics: { at: 1000, workers: { netprobe: { at: 1000, results } } },
  ...patch,
});

describe("связность узлов", () => {
  it("цели узла: остальные узлы с адресом, id цели — id узла", () => {
    expect(netprobeSpec("n1", nodes)).to.deep.equal({
      targets: [
        { id: "n2", host: "10.0.0.2", method: "icmp" },
        { id: "n4", host: "10.0.0.4", method: "icmp" },
      ],
      intervalSec: NETPROBE.intervalSec,
      count: NETPROBE.count,
      timeoutMs: NETPROBE.timeoutMs,
    });
  });

  it("матрица — из метрик netprobe агентов узлов; чужое и на себя отброшено, старое — stale", () => {
    const agents = new Map([
      ["a1", agentWith("a1", [result("n2"), result("n1"), result("n9")])],
      [
        "a2",
        agentWith("a2", [
          result("n1", {
            lossPct: 100,
            received: 0,
            rttAvgMs: undefined,
            error: "timeout",
          }),
        ]),
      ],
    ]);
    const cells = nodeMeshCells(nodes, agents, 1000 + NETPROBE.staleMs + 1);

    expect(cells.map(c => [c.from, c.to, c.stale])).to.deep.equal([
      ["n1", "n2", true],
      ["n2", "n1", true],
    ]);
    expect(cells[1]).to.deep.include({
      lossPct: 100,
      rttAvgMs: null,
      error: "timeout",
    });
    expect(nodeMeshCells(nodes, agents, 1500)[0].stale).to.equal(false);
  });

  it("сверка целей: только агентам с netprobe и только при другом содержимом", async () => {
    const repo = { findForProbe: sinon.stub().resolves(nodes) };
    const agents = {
      find: sinon
        .stub()
        .callsFake(async (id: string) =>
          id === "a3" ? agentWith(id, [], { workers: [] }) : agentWith(id, []),
        ),
    };
    const workers = {
      findConfig: sinon
        .stub()
        .callsFake(async (id: string) =>
          id === "a1" ? { data: netprobeSpec("n1", nodes) } : null,
        ),
      putConfig: sinon.stub().resolves({}),
    };
    const mesh = new NodeMeshService(
      repo as any,
      agents as any,
      workers as any,
    );

    expect(await mesh.syncTargets()).to.equal(1);
    expect(workers.putConfig.firstCall.args.slice(0, 3)).to.deep.equal([
      "a2",
      "netprobe",
      "targets",
    ]);
  });

  it("матрица по видимым узлам", async () => {
    const repo = { findForProbe: sinon.stub().resolves(nodes.slice(0, 2)) };
    const agents = {
      find: sinon
        .stub()
        .callsFake(async (id: string) =>
          agentWith(id, [result(id === "a1" ? "n2" : "n1")]),
        ),
    };
    const mesh = new NodeMeshService(repo as any, agents as any, {} as any);
    const matrix = await mesh.matrix(["n1", "n2"]);

    expect(repo.findForProbe.calledWith(["n1", "n2"])).to.be.true;
    expect(matrix.nodes.map(n => n.id)).to.deep.equal(["n1", "n2"]);
    expect(matrix.cells.map(c => [c.from, c.to])).to.deep.equal([
      ["n1", "n2"],
      ["n2", "n1"],
    ]);
  });

  it("матрица своим: каждому владельцу и создателю — только его узлы", async () => {
    const cell = (from: string, to: string) => ({
      from,
      to,
      method: "icmp",
      sent: 3,
      received: 3,
      lossPct: 0,
      rttAvgMs: 1,
      rttMinMs: 1,
      rttMaxMs: 1,
      at: 1,
      stale: false,
    });
    const full = {
      nodes: nodes
        .slice(0, 3)
        .map(({ id, name, host }) => ({ id, name, host })),
      cells: [cell("n1", "n2"), cell("n2", "n1"), cell("n2", "n3")],
      generatedAt: 5,
    };
    const repo = {
      findOwners: sinon.stub().resolves([
        { id: "n1", ownerId: "u1", createdById: "u2" },
        { id: "n2", ownerId: "u1", createdById: null },
        { id: "n3", ownerId: null, createdById: "u2" },
      ]),
    };
    const mesh = new NodeMeshService(repo as any, {} as any, {} as any);
    const owned = await mesh.byOwner(full);

    expect(repo.findOwners.firstCall.args[0]).to.deep.equal(["n1", "n2", "n3"]);
    expect([...owned.keys()].sort()).to.deep.equal(["u1", "u2"]);
    expect(owned.get("u1")!.nodes.map(n => n.id)).to.deep.equal(["n1", "n2"]);
    expect(owned.get("u1")!.cells.map(c => [c.from, c.to])).to.deep.equal([
      ["n1", "n2"],
      ["n2", "n1"],
    ]);
    expect(owned.get("u2")!.cells, "n1 и n3 не связаны").to.deep.equal([]);
    expect(meshOf(full, new Set()).nodes).to.deep.equal([]);
    expect(owned.get("u1")!.generatedAt).to.equal(5);
  });
});
