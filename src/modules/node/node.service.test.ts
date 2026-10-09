import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";
import { QueryFailedError } from "typeorm";

import { createMockEventBus, createMockRepository } from "../../test/helpers";
import { NodeCreatedEvent, NodeDeletedEvent, NodeUpdatedEvent } from "./events";
import { NodeService } from "./node.service";

const actor = (userId: string, permissions: string[]): any => ({
  userId,
  sessionId: "s1",
  roles: ["user"],
  permissions,
});

const OWN = actor("u1", [
  "node:view:own",
  "node:update:own",
  "node:delete:own",
  "node:assign:own",
]);
const VIEWER_ALL = actor("u9", ["node:view"]);

const node = (patch: Record<string, unknown> = {}) => ({
  id: "n1",
  name: "узел",
  description: null,
  host: "10.0.0.1",
  ownerId: "u1",
  createdById: "u2",
  agentId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...patch,
});

const rejects = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`ожидалась ошибка ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

describe("NodeService", () => {
  let repo: ReturnType<typeof createMockRepository> &
    Record<string, sinon.SinonStub>;
  let view: { toDto: sinon.SinonStub; toDtos: sinon.SinonStub };
  let agents: { revokeAndDelete: sinon.SinonStub };
  let eventBus: ReturnType<typeof createMockEventBus>;
  let service: NodeService;

  beforeEach(() => {
    repo = Object.assign(createMockRepository(), {
      findById: sinon.stub().resolves(node()),
      findWithOwners: sinon.stub().resolves(node()),
      findPage: sinon.stub().resolves([[node()], 1]),
      findOptions: sinon.stub().resolves([node()]),
    });
    view = {
      toDto: sinon.stub().callsFake(async (n: any) => ({ id: n.id })),
      toDtos: sinon
        .stub()
        .callsFake(async (ns: any[]) => ns.map(n => ({ id: n.id }))),
    };
    agents = { revokeAndDelete: sinon.stub().resolves() };
    eventBus = createMockEventBus();
    service = new NodeService(
      repo as any,
      view as any,
      agents as any,
      eventBus as any,
    );
  });

  it("свой узел (владелец или создатель) — виден с областью own", async () => {
    expect(await service.get(OWN, "n1")).to.deep.equal({ id: "n1" });

    repo.findById.resolves(node({ ownerId: null, createdById: "u1" }));
    expect(await service.get(OWN, "n1")).to.deep.equal({ id: "n1" });
  });

  it("чужой узел с областью own — 404; без права на действие — 403", async () => {
    repo.findById.resolves(node({ ownerId: "u5", createdById: "u6" }));
    await rejects(service.get(OWN, "n1"), "NODE_NOT_FOUND");
    await rejects(service.update(OWN, "n1", { name: "x" }), "NODE_NOT_FOUND");

    repo.findById.resolves(node());
    await rejects(
      service.update(VIEWER_ALL, "n1", { name: "x" }),
      "NODE_FORBIDDEN",
    );
  });

  it("список: own — только свои, mine — свои при праве на все, без права — 403", async () => {
    await service.list(OWN, {}, { offset: 0, limit: 20 });
    expect(repo.findPage.lastCall.args[0]).to.deep.equal({ ownedBy: "u1" });

    await service.list(VIEWER_ALL, { query: "a" }, { offset: 0, limit: 20 });
    expect(repo.findPage.lastCall.args[0]).to.deep.equal({ query: "a" });

    await service.list(VIEWER_ALL, { mine: true }, { offset: 0, limit: 20 });
    expect(repo.findPage.lastCall.args[0]).to.deep.equal({ ownedBy: "u9" });

    await rejects(
      service.list(actor("u3", []), {}, { offset: 0, limit: 20 }),
      "NODE_FORBIDDEN",
    );
  });

  it("создание: создатель — автор; чужой владелец без права назначения — 403", async () => {
    const creator = actor("u1", ["node:create"]);

    await service.create(creator, { name: "n", ownerId: "u1" });
    expect(repo.createAndSave.firstCall.args[0]).to.include({
      ownerId: "u1",
      createdById: "u1",
      agentId: null,
    });
    expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(NodeCreatedEvent);

    await rejects(
      service.create(creator, { name: "n", ownerId: "u7" }),
      "NODE_FORBIDDEN",
    );
  });

  it("удаление: агент узла отзывается и удаляется, событие с владельцами", async () => {
    repo.findById.resolves(node({ agentId: "a1" }));

    await service.delete(OWN, "n1");

    expect(repo.delete.calledOnceWith({ id: "n1" })).to.be.true;
    expect(agents.revokeAndDelete.calledOnceWith("u1", "a1")).to.be.true;

    const event = eventBus.emit.firstCall.args[0];

    expect(event).to.be.instanceOf(NodeDeletedEvent);
    expect(event).to.include({ ownerId: "u1", createdById: "u2" });
  });

  it("смена владельца: событие с прежним владельцем", async () => {
    await service.assign(OWN, "n1", { userId: "u4" });

    expect(repo.update.calledOnceWith({ id: "n1" }, { ownerId: "u4" })).to.be
      .true;

    const event = eventBus.emit.firstCall.args[0];

    expect(event).to.be.instanceOf(NodeUpdatedEvent);
    expect(event).to.include({ nodeId: "n1", previousOwnerId: "u1" });

    await service.unassign(OWN, "n1");
    expect(repo.update.lastCall.args[1]).to.deep.equal({ ownerId: null });
  });

  it("владелец не найден (FK) — 404 USER_NOT_FOUND", async () => {
    repo.update.rejects(
      new QueryFailedError(
        "UPDATE",
        [],
        Object.assign(new Error("fk"), {
          code: "23503",
        }),
      ),
    );

    await rejects(
      service.assign(OWN, "n1", { userId: "u404" }),
      "NODE_USER_NOT_FOUND",
    );
  });
});
