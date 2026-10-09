import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { NodeAgentAccessPolicy } from "./node-agent-access.policy";

const actor = (permissions: string[]) => ({
  userId: "u1",
  roles: ["user"],
  permissions,
});

describe("NodeAgentAccessPolicy", () => {
  let repo: Record<string, sinon.SinonStub>;
  let policy: NodeAgentAccessPolicy;

  beforeEach(() => {
    repo = {
      findByAgentId: sinon
        .stub()
        .callsFake(async (agentId: string) =>
          agentId === "a-own"
            ? { id: "n1", ownerId: "u1", createdById: "u2", agentId }
            : agentId === "a-other"
              ? { id: "n2", ownerId: "u5", createdById: "u5", agentId }
              : null,
        ),
      findAgentIds: sinon.stub().resolves(["a-own"]),
    };
    policy = new NodeAgentAccessPolicy(repo as any);
  });

  it("node:agent:own — управление только агентом своего узла", async () => {
    const own = actor(["node:agent:own"]);

    expect(await policy.canAccess(own, "a-own", "manage")).to.equal(true);
    expect(await policy.canAccess(own, "a-other", "manage")).to.equal(false);
    expect(await policy.canAccess(own, "a-free", "manage")).to.equal(false);
    expect(
      await policy.canAccess(own, "a-own", "view"),
      "просмотр — node:view",
    ).to.equal(false);
    expect(
      await policy.canAccess(own, "a-own", "logs"),
      "журнал — node:logs",
    ).to.equal(false);
  });

  it("право на все узлы — агенты всех узлов, но не агенты без узла", async () => {
    const all = actor(["node:view"]);

    expect(await policy.canAccess(all, "a-other", "view")).to.equal(true);
    expect(await policy.canAccess(all, "a-free", "view")).to.equal(false);

    await policy.agentIds(all, "view");
    expect(repo.findAgentIds.lastCall.args[0]).to.equal(undefined);
  });

  it("список агентов: own — свои узлы, нет права — пусто без запроса", async () => {
    expect(
      await policy.agentIds(actor(["node:logs:own"]), "logs"),
    ).to.deep.equal(["a-own"]);
    expect(repo.findAgentIds.lastCall.args[0]).to.equal("u1");

    repo.findAgentIds.resetHistory();
    expect(await policy.agentIds(actor([]), "config")).to.deep.equal([]);
    expect(repo.findAgentIds.called).to.be.false;
  });
});
