import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";
import { QueryFailedError } from "typeorm";

import { createMockEventBus, createMockRepository } from "../../test/helpers";
import { NodeCreatedEvent, NodeUpdatedEvent } from "./events";
import { NodeAgentService } from "./node-agent.service";

const agent = (id = "a-new"): any => ({
  id,
  name: "host-1",
  labels: {},
  online: false,
  revoked: false,
  enrolledAt: 1,
  workers: [],
  alerts: [],
});

const fkError = () =>
  new QueryFailedError(
    "INSERT",
    [],
    Object.assign(new Error("fk"), { code: "23503" }),
  );

describe("NodeAgentService", () => {
  let repo: ReturnType<typeof createMockRepository> &
    Record<string, sinon.SinonStub>;
  let nodes: { findFor: sinon.SinonStub };
  let agents: Record<string, sinon.SinonStub>;
  let enrollment: Record<string, sinon.SinonStub>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let service: NodeAgentService;

  beforeEach(() => {
    repo = Object.assign(createMockRepository(), {
      findById: sinon
        .stub()
        .resolves({ id: "n1", name: "узел", agentId: null }),
      setAgent: sinon.stub().resolves(true),
      findUnbound: sinon.stub().resolves([]),
      bindFree: sinon.stub().resolves(true),
      clearAgent: sinon.stub().resolves("n1"),
      fillHost: sinon.stub().resolves("n1"),
    });
    nodes = {
      findFor: sinon.stub().resolves({ id: "n1", name: "узел", agentId: null }),
    };
    agents = {
      revokeAs: sinon.stub().resolves(),
      revokeAndDelete: sinon.stub().resolves(),
      installCommand: sinon.stub().callsFake((body: any) => ({
        command: `curl … --token ${body.token}`,
      })),
    };
    enrollment = {
      createToken: sinon.stub().resolves({
        enrollmentToken: { id: "t1" },
        token: "pref.secret",
      }),
      revokeToken: sinon.stub().resolves(),
    };
    eventBus = createMockEventBus();
    service = new NodeAgentService(
      repo as any,
      nodes as any,
      agents as any,
      enrollment as any,
      eventBus as any,
    );
  });

  it("команда установки: одноразовый токен с меткой узла и сроком", async () => {
    const before = Date.now();
    const created = await service.installCommand(
      { userId: "u1" } as any,
      "n1",
      {
        expiresInMinutes: 30,
      },
    );
    const body = enrollment.createToken.firstCall.args[1];

    expect(enrollment.createToken.firstCall.args[0]).to.equal("u1");
    expect(body).to.include({ maxUses: 1 });
    expect(body.labels).to.deep.equal({ nodeId: "n1" });
    expect(body.expiresAt.getTime()).to.be.within(
      before + 30 * 60_000 - 10,
      Date.now() + 30 * 60_000,
    );
    expect(created).to.include({
      token: "pref.secret",
      tokenId: "t1",
      command: "curl … --token pref.secret",
    });
    expect(agents.installCommand.firstCall.args[0].workers).to.deep.equal([
      "netprobe",
    ]);
  });

  it("регистрация токеном узла — агент привязывается, прежний отзывается", async () => {
    repo.findById.resolves({ id: "n1", agentId: "a-old" });

    await service.onEnrolled(agent(), {
      tokenId: "t1",
      createdBy: "u1",
      labels: { nodeId: "n1" },
    });

    expect(repo.setAgent.calledOnceWith("n1", "a-new", "host-1")).to.be.true;
    expect(agents.revokeAs.calledOnceWith("", "a-old")).to.be.true;
    expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(NodeUpdatedEvent);
    expect(repo.createAndSave.called).to.be.false;
  });

  it("токен для удалённого узла — агент не привязывается и узел не создаётся", async () => {
    repo.findById.resolves(null);

    await service.onEnrolled(agent(), {
      tokenId: "t1",
      createdBy: "u1",
      labels: { nodeId: "n404" },
    });

    expect(repo.setAgent.called).to.be.false;
    expect(repo.createAndSave.called).to.be.false;
  });

  it("регистрация без метки — новый узел: имя агента, владелец — кто создал токен", async () => {
    await service.onEnrolled(agent(), {
      tokenId: "t1",
      createdBy: "u1",
      labels: {},
    });

    expect(repo.createAndSave.firstCall.args[0]).to.include({
      name: "host-1",
      ownerId: "u1",
      createdById: "u1",
      agentId: "a-new",
      agentName: "host-1",
    });
    expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(NodeCreatedEvent);
  });

  it("регистрация без метки — к узлу без агента: прежнее имя агента, затем имя узла, затем адрес", async () => {
    const source = { tokenId: null, createdBy: null, labels: {} };

    repo.findUnbound
      .withArgs({ agentName: "host-1" })
      .resolves([{ id: "n-old" }]);
    await service.onEnrolled(agent(), source);
    expect(repo.bindFree.calledOnceWith("n-old", "a-new", "host-1")).to.be.true;
    expect(repo.createAndSave.called).to.be.false;
    expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(NodeUpdatedEvent);

    repo.findUnbound.reset();
    repo.findUnbound.resolves([]);
    repo.findUnbound.withArgs({ name: "host-1" }).resolves([{ id: "n-name" }]);
    await service.onEnrolled(agent("a2"), source);
    expect(repo.bindFree.lastCall.args).to.deep.equal([
      "n-name",
      "a2",
      "host-1",
    ]);

    repo.findUnbound.reset();
    repo.findUnbound.resolves([]);
    repo.findUnbound
      .withArgs({ host: "203.0.113.7" })
      .resolves([{ id: "n-host" }]);
    await service.onEnrolled(
      { ...agent("a3"), address: "203.0.113.7" },
      source,
    );
    expect(repo.bindFree.lastCall.args[0]).to.equal("n-host");
  });

  it("регистрация без метки: подходят несколько узлов или узел заняли — новый узел", async () => {
    const source = { tokenId: null, createdBy: null, labels: {} };

    repo.findUnbound
      .withArgs({ agentName: "host-1" })
      .resolves([{ id: "n1" }, { id: "n2" }]);
    await service.onEnrolled(agent(), source);
    expect(repo.bindFree.called).to.be.false;
    expect(repo.createAndSave.calledOnce).to.be.true;

    repo.findUnbound.reset();
    repo.findUnbound.resolves([]);
    repo.findUnbound.withArgs({ name: "host-1" }).resolves([{ id: "n1" }]);
    repo.bindFree.resolves(false);
    await service.onEnrolled(agent("a2"), source);
    expect(repo.createAndSave.calledTwice).to.be.true;
  });

  it("общий токен или удалённый автор токена — узел без владельца", async () => {
    await service.onEnrolled(agent(), {
      tokenId: null,
      createdBy: null,
      labels: {},
    });
    expect(repo.createAndSave.firstCall.args[0]).to.include({ ownerId: null });

    repo.createAndSave.onSecondCall().rejects(fkError());
    await service.onEnrolled(agent("a3"), {
      tokenId: "t2",
      createdBy: "u-deleted",
      labels: {},
    });
    expect(repo.createAndSave.thirdCall.args[0]).to.include({
      ownerId: null,
      agentId: "a3",
    });
  });

  it("адрес агента — в узел без адреса; без адреса агента — ничего", async () => {
    await service.fillHost({ ...agent(), address: "203.0.113.7" } as any);

    expect(repo.fillHost.calledOnceWith("a-new", "203.0.113.7")).to.be.true;
    expect(eventBus.emit.firstCall.args[0]).to.include({ nodeId: "n1" });

    repo.fillHost.resolves(null);
    await service.fillHost({ ...agent(), address: "203.0.113.8" } as any);
    expect(eventBus.emit.calledOnce, "адрес у узла уже был — без события").to.be
      .true;

    await service.fillHost({ ...agent(), address: undefined } as any);
    expect(repo.fillHost.calledTwice).to.be.true;
  });

  it("агент отозван или удалён — узел без агента и событие", async () => {
    await service.onAgentGone("a1");

    expect(repo.clearAgent.calledOnceWith("a1")).to.be.true;
    expect(eventBus.emit.firstCall.args[0]).to.include({ nodeId: "n1" });

    repo.clearAgent.resolves(null);
    await service.onAgentGone("a2");
    expect(eventBus.emit.calledOnce, "агент не узла — без события").to.be.true;
  });

  it("удаление с машины: агент узла отзывается и удаляется", async () => {
    repo.findById.resolves({ id: "n1", agentId: "a1" });

    await service.detach("n1", "u1");

    expect(agents.revokeAndDelete.calledOnceWith("u1", "a1")).to.be.true;
    expect(repo.clearAgent.calledOnceWith("a1")).to.be.true;
  });
});
