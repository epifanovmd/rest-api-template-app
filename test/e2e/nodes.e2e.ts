import { expect } from "chai";

import { enroll, RealAgent } from "./agent";
import {
  Actor,
  call,
  eventually,
  expectStatus,
  items,
  signIn,
  signInAdmin,
  signUp,
} from "./client";
import { AGENT_BOOTSTRAP_TOKEN, AGENT_VERSION } from "./harness";
import { connectSocket, TestSocket } from "./socket";

const NETPROBE = "netprobe";

/** Права «только свои» для владельца узлов. */
const OWN_NODE_PERMISSIONS = [
  "node:view:own",
  "node:update:own",
  "node:agent:own",
  "node:logs:own",
  "node:provision:own",
];

describe("узлы", function () {
  this.timeout(120_000);

  let admin: Actor;
  let bob: Actor;
  let adminSocket: TestSocket;
  let bobSocket: TestSocket;
  /** Узел админа (без агента) и узел Боба (с агентом). */
  let nodeA: any;
  let nodeB: any;
  let agentB: RealAgent;
  let agentBId: string;
  /** Агент, зарегистрированный общим токеном, и созданный для него узел. */
  let autoAgentId: string;
  let autoNodeId: string;

  const getNode = async (who: Actor, id: string) =>
    (await call(who, "GET", `/api/v1/nodes/${id}`)).data;

  before(async () => {
    admin = await signInAdmin();

    const created = await signUp("n-bob");

    expectStatus(
      await call(admin, "PATCH", `/api/v1/user/setPrivileges/${created.id}`, {
        roles: ["user"],
        permissions: OWN_NODE_PERMISSIONS,
      }),
      200,
    );
    bob = {
      ...(await signIn(created.email, created.password)),
      id: created.id,
    };
    adminSocket = await connectSocket(admin);
    bobSocket = await connectSocket(bob);
  });

  after(async () => {
    await agentB?.stop();
    adminSocket?.close();
    bobSocket?.close();
  });

  it("создание: статус «ожидает агента», событие в комнату nodes и владельцу", async () => {
    expect((await adminSocket.join("nodes")).ok).to.equal(true);
    expect((await bobSocket.join("nodes")).ok, "nodes — право на все").to.equal(
      false,
    );

    const listed = adminSocket.next(
      "node:updated",
      (n: any) => n.name === "e2e-a",
    );

    nodeA = expectStatus(
      await call(admin, "POST", "/api/v1/nodes", {
        name: "e2e-a",
        host: "127.0.0.1",
      }),
      201,
    ).data;
    expect(nodeA).to.include({
      status: "created",
      statusMessage: "Ожидает агента",
      agentId: null,
      createdById: (await listed).createdById,
    });
    expect(nodeA.config.status).to.equal("awaitingAgent");

    const personal = bobSocket.next(
      "node:updated",
      (n: any) => n.name === "e2e-b",
    );

    nodeB = expectStatus(
      await call(admin, "POST", "/api/v1/nodes", {
        name: "e2e-b",
        host: "127.0.0.2",
        ownerId: bob.id,
      }),
      201,
    ).data;
    expect((await personal).ownerId).to.equal(bob.id);
    expect(nodeB.ownerName).to.be.a("string");

    expectStatus(await call(bob, "POST", "/api/v1/nodes", { name: "x" }), 403);
  });

  it("права «свои»: список, карточка, options, изменение; чужой — 404, без права — 403", async () => {
    const all = items(
      expectStatus(await call(admin, "GET", "/api/v1/nodes?limit=100"), 200)
        .data,
    ).map((n: any) => n.id);

    expect(all).to.include.members([nodeA.id, nodeB.id]);

    const own = expectStatus(await call(bob, "GET", "/api/v1/nodes"), 200);

    expect(items(own.data).map((n: any) => n.id)).to.deep.equal([nodeB.id]);
    expect(own.data.total).to.equal(1);

    const search = expectStatus(
      await call(admin, "GET", "/api/v1/nodes?query=e2e-b&mine=false"),
      200,
    );

    expect(items(search.data).map((n: any) => n.id)).to.deep.equal([nodeB.id]);
    expect(
      items(
        (await call(admin, "GET", "/api/v1/nodes?mine=true&limit=100")).data,
      ).map((n: any) => n.id),
    ).to.include(nodeA.id);

    const options = expectStatus(
      await call(bob, "GET", "/api/v1/nodes/options"),
      200,
    );

    expect(options.data).to.deep.equal([
      { id: nodeB.id, name: "e2e-b", host: "127.0.0.2", agentId: null },
    ]);

    expectStatus(await call(bob, "GET", `/api/v1/nodes/${nodeA.id}`), 404);
    expect((await getNode(bob, nodeB.id)).id).to.equal(nodeB.id);

    const updated = expectStatus(
      await call(bob, "PATCH", `/api/v1/nodes/${nodeB.id}`, {
        description: "мой узел",
      }),
      200,
    );

    expect(updated.data.description).to.equal("мой узел");
    expectStatus(
      await call(bob, "PATCH", `/api/v1/nodes/${nodeA.id}`, { name: "x" }),
      404,
      "NODE_NOT_FOUND",
    );
    expectStatus(
      await call(bob, "DELETE", `/api/v1/nodes/${nodeB.id}`),
      403,
      "AUTH_INSUFFICIENT_PERMISSIONS",
    );
    expectStatus(
      await call(bob, "POST", `/api/v1/nodes/${nodeB.id}/unassign`),
      403,
    );
  });

  it("назначение и снятие владельца: узел появляется у нового и уходит у прежнего", async () => {
    const assigned = bobSocket.next(
      "node:updated",
      (n: any) => n.id === nodeA.id,
    );

    expectStatus(
      await call(admin, "POST", `/api/v1/nodes/${nodeA.id}/assign`, {
        userId: bob.id,
      }),
      200,
    );
    await assigned;
    expect((await getNode(bob, nodeA.id)).ownerId).to.equal(bob.id);
    expect((await bobSocket.join("node", nodeA.id)).ok).to.equal(true);

    const removed = bobSocket.next(
      "node:deleted",
      (n: any) => n.id === nodeA.id,
    );

    expectStatus(
      await call(admin, "POST", `/api/v1/nodes/${nodeA.id}/unassign`),
      200,
    );
    await removed;
    expectStatus(await call(bob, "GET", `/api/v1/nodes/${nodeA.id}`), 404);
    expect((await bobSocket.join("node", nodeA.id)).ok).to.equal(false);
  });

  it("команда установки: одноразовый токен с меткой узла — агент привязывается к узлу", async () => {
    const command = expectStatus(
      await call(bob, "POST", `/api/v1/nodes/${nodeB.id}/install-command`, {
        expiresInMinutes: 30,
      }),
      201,
    ).data;

    expect(command.command).to.include("/api/v1/agent-bundle/install.sh");
    expect(command.command).to.include(command.token);
    expectStatus(
      await call(bob, "POST", `/api/v1/nodes/${nodeA.id}/install-command`, {}),
      404,
    );

    const online = bobSocket.next(
      "node:updated",
      (n: any) => n.id === nodeB.id && n.status === "online",
      30_000,
    );

    agentB = await RealAgent.start({
      token: command.token,
      name: "e2e-node-b",
      workers: ["echo", "netprobe"],
    });
    agentBId = agentB.agentId;
    expect(
      (await enroll(command.token, "again")).status,
      "одноразовый",
    ).to.equal(401);

    const card = await online;

    expect(card.agentId).to.equal(agentBId);
    expect(card.agent).to.include({ online: true, version: AGENT_VERSION });
    expect(card.agent.workers.map((w: any) => w.name)).to.include.members([
      "echo",
      "netprobe",
    ]);
    expect(card.agent.host.hostname).to.be.a("string");
  });

  it("агент общим токеном — узел создаётся сам, без владельца", async () => {
    const registered = await enroll(AGENT_BOOTSTRAP_TOKEN, "e2e-auto");

    expect(registered.status).to.equal(200);
    autoAgentId = registered.agentId!;

    const node = await eventually(
      async () =>
        items(
          (await call(admin, "GET", "/api/v1/nodes?query=e2e-auto")).data,
        ).find((n: any) => n.agentId === autoAgentId),
      { what: "узел агента" },
    );

    expect(node).to.include({ name: "e2e-auto", ownerId: null });
    expect(node.status).to.equal("offline");
    autoNodeId = node.id;
  });

  it("агент без метки узла с именем узла без агента — привязывается к нему, новый узел не создаётся", async () => {
    const node = expectStatus(
      await call(admin, "POST", "/api/v1/nodes", { name: "e2e-rebind" }),
      201,
    ).data;
    const registered = await enroll(AGENT_BOOTSTRAP_TOKEN, "e2e-rebind");

    expect(registered.status).to.equal(200);

    const bound = await eventually(
      async () => {
        const found = await getNode(admin, node.id);

        return found?.agentId === registered.agentId && found;
      },
      { what: "агент привязан к узлу по имени" },
    );

    expect(bound.agentName).to.equal("e2e-rebind");
    expect(
      items(
        (await call(admin, "GET", "/api/v1/nodes?query=e2e-rebind")).data,
      ).map((n: any) => n.id),
    ).to.deep.equal([node.id]);

    // Агента удалили — узел помнит имя; агент с тем же именем снова находит узел.
    expectStatus(
      await call(admin, "DELETE", `/api/v1/agents/${registered.agentId}`),
      204,
    );
    await eventually(
      async () => (await getNode(admin, node.id))?.agentId === null,
      { what: "узел без агента" },
    );
    expectStatus(
      await call(admin, "PATCH", `/api/v1/nodes/${node.id}`, {
        name: "e2e-rebind-renamed",
      }),
      200,
    );

    const again = await enroll(AGENT_BOOTSTRAP_TOKEN, "e2e-rebind");

    await eventually(
      async () => (await getNode(admin, node.id))?.agentId === again.agentId,
      { what: "привязка по прежнему имени агента" },
    );
    expectStatus(await call(admin, "DELETE", `/api/v1/nodes/${node.id}`), 204);
  });

  it("доступ к агенту через узел: свой — да, чужой — 404, отзыв и удаление — только agent:manage", async () => {
    expectStatus(await call(bob, "GET", `/api/v1/agents/${agentBId}`), 200);
    expect(
      items(
        expectStatus(await call(bob, "GET", "/api/v1/agents"), 200).data,
      ).map((a: any) => a.id),
    ).to.deep.equal([agentBId]);
    expectStatus(await call(bob, "GET", `/api/v1/agents/${autoAgentId}`), 404);
    expectStatus(
      await call(bob, "GET", `/api/v1/agents/events?agentId=${agentBId}`),
      200,
    );
    expectStatus(
      await call(
        bob,
        "PUT",
        `/api/v1/agents/${agentBId}/workers/echo/configs/settings`,
        { data: { prefix: "b:" } },
      ),
      200,
    );

    const echo = expectStatus(
      await call(bob, "POST", `/api/v1/agents/${agentBId}/workers/echo/fetch`, {
        method: "POST",
        path: "/echo",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "узел" }),
      }),
      200,
    ).data;

    expect(echo.text).to.match(/УЗЕЛ$/);
    expectStatus(
      await call(bob, "POST", `/api/v1/agents/${agentBId}/revoke`),
      403,
    );
    expectStatus(await call(bob, "DELETE", `/api/v1/agents/${agentBId}`), 403);
    expectStatus(
      await call(bob, "POST", `/api/v1/agents/${autoAgentId}/revoke`),
      404,
    );
    expect((await bobSocket.join("agent", agentBId)).ok).to.equal(true);
    expect((await bobSocket.join("agent", autoAgentId)).ok).to.equal(false);
    expect((await bobSocket.join("node", nodeB.id)).ok).to.equal(true);
  });

  it("связность: цели — настройка targets воркера netprobe, матрица — из его метрик; своим — лично", async () => {
    // Права «свои»: матрица по своим узлам и нагрузка узла — лично, без комнаты.
    const personalMesh = bobSocket.next(
      "node:mesh",
      (m: any) => m.nodes.some((n: any) => n.id === nodeB.id),
      60_000,
    );
    const personalLoad = bobSocket.next(
      "node:load",
      (l: any) => l.nodeId === nodeB.id,
      20_000,
    );
    const config = await eventually(
      async () => {
        const res = await call(
          bob,
          "GET",
          `/api/v1/agents/${agentBId}/workers/${NETPROBE}/configs/targets`,
        );

        return (
          res.status === 200 && res.data.status.state === "applied" && res.data
        );
      },
      { what: "цели netprobe применены", timeoutMs: 30_000 },
    );

    expect(config.config.data.targets).to.deep.include({
      id: nodeA.id,
      host: "127.0.0.1",
      method: "icmp",
    });
    expect(config.config.data.targets.map((t: any) => t.id)).to.not.include(
      nodeB.id,
    );

    const mesh = await eventually(
      async () => {
        const matrix = expectStatus(
          await call(admin, "GET", "/api/v1/nodes/mesh"),
          200,
        ).data;

        return (
          matrix.cells.some(
            (c: any) => c.from === nodeB.id && c.to === nodeA.id,
          ) && matrix
        );
      },
      { what: "итог netprobe в матрице", timeoutMs: 45_000, intervalMs: 1_000 },
    );
    const cell = mesh.cells.find(
      (c: any) => c.from === nodeB.id && c.to === nodeA.id,
    );

    expect(cell).to.include({ to: nodeA.id, stale: false });
    expect(cell.sent).to.be.greaterThan(0);

    const own = expectStatus(
      await call(bob, "GET", "/api/v1/nodes/mesh"),
      200,
    ).data;

    expect(own.nodes.map((n: any) => n.id)).to.deep.equal([nodeB.id]);
    expect(own.cells, "узел A — не свой").to.deep.equal([]);

    const load = await personalLoad;

    expect(load.agentId).to.equal(agentBId);
    expect(load.point.host).to.be.an("object");
    expect(load.point.workers, "только нагрузка узла").to.equal(undefined);

    const mine = await personalMesh;

    expect(mine.nodes.map((n: any) => n.id)).to.deep.equal([nodeB.id]);
    expect(mine.cells, "чужие узлы не уходят своим").to.deep.equal([]);
  });

  it("установка по SSH: задача узла, провал — статус error; задачи видит владелец", async () => {
    const started = expectStatus(
      await call(admin, "POST", `/api/v1/nodes/${nodeA.id}/agent/install`, {
        port: 1,
        username: "root",
        password: "e2e",
      }),
      202,
    ).data;

    const failed = await eventually(
      async () => {
        const node = await getNode(admin, nodeA.id);

        return node.status === "error" && node;
      },
      { what: "провал установки", timeoutMs: 20_000 },
    );

    expect(failed.job).to.include({
      id: started.jobId,
      kind: "install",
      status: "failed",
    });
    expect(failed.job.error.code).to.equal("NODE_INSTALL_FAILED");

    const job = expectStatus(
      await call(admin, "GET", `/api/v1/jobs/${started.jobId}`),
      200,
    ).data;

    expect(job.logTail.join("\n")).to.include("Подключение root@127.0.0.1:1");
    expect(JSON.stringify(job)).to.not.include('e2e"');

    expectStatus(
      await call(bob, "POST", `/api/v1/nodes/${nodeB.id}/agent/install`, {}),
      400,
    );

    const uninstall = expectStatus(
      await call(bob, "POST", `/api/v1/nodes/${nodeB.id}/agent/uninstall`, {
        host: "127.0.0.1",
        port: 1,
        privateKey: "not-a-key",
        purge: true,
      }),
      202,
    ).data;

    await eventually(
      async () =>
        (await call(bob, "GET", `/api/v1/jobs/${uninstall.jobId}`)).data
          ?.status === "failed",
      { what: "провал удаления", timeoutMs: 20_000 },
    );

    const kept = await getNode(bob, nodeB.id);

    expect(kept.agentId, "удаление не удалось — агент остаётся").to.equal(
      agentBId,
    );
    expect(kept.job).to.include({ kind: "uninstall", status: "failed" });
  });

  it("отзыв агента — узел без агента; удаление узла — агент удаляется", async () => {
    expectStatus(
      await call(admin, "POST", `/api/v1/agents/${agentBId}/revoke`),
      200,
    );
    await agentB.stop();
    await eventually(
      async () => (await getNode(bob, nodeB.id)).agentId === null,
      { what: "отвязка агента" },
    );

    const deleted = adminSocket.next(
      "node:deleted",
      (n: any) => n.id === autoNodeId,
    );

    expectStatus(
      await call(admin, "DELETE", `/api/v1/nodes/${autoNodeId}`),
      204,
    );
    await deleted;
    expectStatus(
      await call(admin, "GET", `/api/v1/agents/${autoAgentId}`),
      404,
    );
    expectStatus(await call(admin, "DELETE", `/api/v1/nodes/${nodeA.id}`), 204);
    expectStatus(await call(admin, "GET", `/api/v1/nodes/${nodeA.id}`), 404);
  });
});
