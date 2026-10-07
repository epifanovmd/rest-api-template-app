import { expect } from "chai";
import sinon from "sinon";

import { ConflictException, EventBus } from "../../core";
import type { IAgentCapability } from "./agent.capability";
import type { Agent } from "./agent.entity";
import { EAgentTransport } from "./agent.types";
import { AgentCapabilityRegistry } from "./agent-capability.registry";
import { EAgentLinkClose } from "./agent-link.protocol";
import {
  AgentSession,
  IAgentTransport,
  negotiateProtocol,
} from "./agent-session";

class FakeTransport implements IAgentTransport {
  readonly kind = EAgentTransport.WS;
  sent: any[] = [];
  closedWith: number | null = null;

  send(raw: string): void {
    this.sent.push(JSON.parse(raw));
  }

  close(code: number): void {
    this.closedWith = code;
  }

  of(type: string): any[] {
    return this.sent.filter(m => m.type === type);
  }
}

const hello = (protocols = [1]) =>
  JSON.stringify({
    type: "hello",
    data: {
      protocols,
      agent: { name: "a", version: "1", bootId: "boot", startedAt: 1 },
      host: { hostname: "h", os: "linux", arch: "amd64" },
      capabilities: { commands: { names: ["x"] } },
      jobs: [],
    },
  });

const status = (seq: number) =>
  JSON.stringify({
    type: "status",
    seq,
    data: { state: "idle", slots: {}, jobs: [], workloads: [], outbox: 0 },
  });

describe("AgentSession", () => {
  let transport: FakeTransport;
  let capability: Record<string, sinon.SinonStub> & { handles: string[] };
  let agents: Record<string, sinon.SinonStub>;
  let presence: Record<string, sinon.SinonStub>;
  let clock: sinon.SinonFakeTimers;

  const create = (sessionId?: string) =>
    new AgentSession(
      { id: "agent-1", labels: {}, capabilities: {} } as unknown as Agent,
      transport,
      {
        agents: agents as any,
        presence: presence as any,
        capabilities: new AgentCapabilityRegistry([
          capability as unknown as IAgentCapability,
        ]),
        eventBus: new EventBus(),
      },
      "127.0.0.1",
      sessionId,
    );

  const settle = async (session: AgentSession) => {
    await clock.tickAsync(50);
    await session.settle();
  };

  beforeEach(() => {
    clock = sinon.useFakeTimers({ shouldAdvanceTime: false });
    transport = new FakeTransport();
    capability = {
      handles: ["cmd.done", "cmd.accept"],
      onOpen: sinon.stub().resolves(),
      onResume: sinon.stub().resolves(),
      onStatus: sinon.stub().resolves(),
      onMessage: sinon.stub().resolves(),
      onClose: sinon.stub().resolves(),
    } as any;
    agents = {
      openSession: sinon.stub().resolves(),
      touch: sinon.stub().resolves(true),
      updateJobsCapacity: sinon.stub().resolves(),
    };
    presence = {
      getStreamSeq: sinon.stub().resolves(null),
      setStreamSeq: sinon.stub().resolves(),
      setSession: sinon.stub().resolves(),
      setStatus: sinon.stub().resolves(),
      getStatus: sinon.stub().resolves(null),
    };
  });

  afterEach(() => clock.restore());

  it("negotiateProtocol: наибольшая общая версия или null", () => {
    expect(negotiateProtocol([1, 2])).to.equal(1);
    expect(negotiateProtocol([7])).to.equal(null);
  });

  it("hello → welcome, сессия открыта, возможности уведомлены", async () => {
    const session = create();

    session.receive(hello());
    await settle(session);

    const [welcome] = transport.of("welcome");

    expect(welcome.data).to.include({ protocol: 1, agentId: "agent-1" });
    expect(welcome.data.sessionId).to.equal(session.sessionId);
    expect(agents.openSession.calledOnce).to.equal(true);
    expect(presence.setSession.calledOnce).to.equal(true);
    expect(capability.onOpen.calledOnce).to.equal(true);
    expect(session.ready).to.equal(true);
    expect(session.supports("commands")).to.equal(true);
    expect(session.supports("jobs")).to.equal(false);
  });

  it("первым не hello, нет общей версии, тишина — закрытие кодом протокола", async () => {
    const first = create();

    first.receive(status(1));
    await settle(first);
    expect(transport.closedWith).to.equal(EAgentLinkClose.Protocol);

    transport = new FakeTransport();
    const second = create();

    second.receive(hello([9]));
    await settle(second);
    expect(transport.closedWith).to.equal(EAgentLinkClose.Unsupported);

    transport = new FakeTransport();
    create();
    await clock.tickAsync(11_000);
    expect(transport.closedWith).to.equal(EAgentLinkClose.Protocol);
  });

  it("поток: повтор seq не обрабатывается, ack — последний seq; seq помнится по bootId", async () => {
    presence.getStreamSeq.resolves({ bootId: "boot", seq: 5 });

    const session = create();

    session.receive(hello());
    session.receive(status(5)); // уже принят прежней сессией
    session.receive(status(6));
    session.receive(status(6));
    await settle(session);

    expect(capability.onStatus.callCount).to.equal(1);
    expect(transport.of("ack").at(-1).data).to.deep.equal({ seq: 6 });
    expect(presence.setStreamSeq.calledWith("agent-1", "boot", 6)).to.equal(
      true,
    );
  });

  it("надёжное: успех — ack по id; 4xx — error без повтора; иначе — с повтором", async () => {
    const session = create();

    session.receive(hello());
    session.receive(
      JSON.stringify({
        type: "cmd.done",
        id: "ok-1",
        data: { commandId: "11111111-1111-4111-8111-111111111111", ok: true },
      }),
    );
    await settle(session);
    expect(transport.of("ack").some(a => a.data.ids?.includes("ok-1"))).to.be
      .true;

    capability.onMessage.onCall(1).rejects(new ConflictException("занято"));
    capability.onMessage.onCall(2).rejects(new Error("БД недоступна"));
    for (const id of ["c-409", "c-500"]) {
      session.receive(
        JSON.stringify({
          type: "cmd.done",
          id,
          data: { commandId: "11111111-1111-4111-8111-111111111111", ok: true },
        }),
      );
    }
    await settle(session);

    const errors = transport.of("error");

    expect(errors.find(e => e.re === "c-409").data.retryable).to.equal(false);
    expect(errors.find(e => e.re === "c-500").data.retryable).to.equal(true);
  });

  it("неизвестный тип и невалидные данные — error без повтора, сессия жива", async () => {
    const session = create();

    session.receive(hello());
    session.receive(JSON.stringify({ type: "teleport", id: "t-1" }));
    session.receive(
      JSON.stringify({ type: "cmd.done", id: "bad-1", data: { ok: "да" } }),
    );
    await settle(session);

    const codes = transport.of("error").map(e => [e.re, e.data.code]);

    expect(codes).to.deep.include(["t-1", "AGENT_UNKNOWN_TYPE"]);
    expect(codes).to.deep.include(["bad-1", "AGENT_MESSAGE_INVALID"]);
    expect(transport.closedWith).to.equal(null);
  });

  it("status: живое состояние, пульс; вытеснена другой сессией — 4410", async () => {
    const session = create();

    session.receive(hello());
    await settle(session);
    await clock.tickAsync(16_000);
    agents.touch.resolves(false);
    session.receive(status(1));
    await settle(session);

    expect(presence.setStatus.calledOnce).to.equal(true);
    expect(agents.touch.calledOnce).to.equal(true);
    expect(transport.closedWith).to.equal(EAgentLinkClose.Replaced);
  });

  it("восстановление (HTTP sync в другом процессе): без сверки, onResume", async () => {
    const session = create("session-7");

    await session.resume({
      sessionId: "session-7",
      protocol: 1,
      hello: JSON.parse(hello()).data,
    });

    expect(session.sessionId).to.equal("session-7");
    expect(session.ready).to.equal(true);
    expect(capability.onResume.calledOnce).to.equal(true);
    expect(capability.onOpen.called).to.equal(false);
    expect(agents.openSession.called).to.equal(false);
  });

  it("закрытие — onClose возможностей, повторное закрытие ничего не делает", async () => {
    const session = create();

    session.receive(hello());
    await settle(session);
    session.close(EAgentLinkClose.Normal, "bye");
    session.close(EAgentLinkClose.Normal, "bye");
    await session.dispose();

    expect(capability.onClose.calledOnce).to.equal(true);
    expect(session.ready).to.equal(false);
  });
});
