import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  createMockEmitter,
  createMockRepository,
  uuid,
  uuid2,
} from "../../test/helpers";
import { CallHandler } from "./call.handler";
import { ECallStatus } from "./call.types";

describe("CallHandler", () => {
  let handler: CallHandler;
  let callRepo: ReturnType<typeof createMockRepository>;
  let emitter: ReturnType<typeof createMockEmitter>;

  const callerId = uuid();
  const calleeId = uuid2();
  const callId = "33333333-3333-4333-8333-333333333333";
  const outsiderId = "00000000-0000-0000-0000-000000000009";

  const createMockSocket = (userId: string) => {
    const handlers: Record<string, Function> = {};

    return {
      on: (event: string, fn: Function) => {
        handlers[event] = fn;
      },
      emit: sinon.stub(),
      data: { userId },
      _handlers: handlers,
    };
  };

  const makeCall = (status = ECallStatus.ACTIVE) => ({
    id: callId,
    callerId,
    calleeId,
    status,
  });

  beforeEach(() => {
    callRepo = createMockRepository();
    emitter = createMockEmitter();
    (callRepo as any).findById = sinon.stub().resolves(makeCall());
    handler = new CallHandler(emitter as any, callRepo as any);
  });

  afterEach(() => sinon.restore());

  const signalingEvents = [
    ["call:offer", "call:offer", { sdp: "x" }],
    ["call:answer", "call:answer", { sdp: "x" }],
    ["call:ice-candidate", "call:ice-candidate", { candidate: "c" }],
    ["call:hangup", "call:ended", {}],
  ] as const;

  for (const [event, outgoing, extra] of signalingEvents) {
    describe(event, () => {
      it("шлёт второй стороне звонка и игнорирует targetUserId", async () => {
        const socket = createMockSocket(callerId);

        handler.onConnection(socket as any);
        await socket._handlers[event]({
          callId,
          targetUserId: outsiderId,
          ...extra,
        });

        expect(emitter.toUser.calledOnce).to.be.true;
        expect(emitter.toUser.firstCall.args[0]).to.equal(calleeId);
        expect(emitter.toUser.firstCall.args[1]).to.equal(outgoing);
      });

      it("callee шлёт caller'у", async () => {
        const socket = createMockSocket(calleeId);

        handler.onConnection(socket as any);
        await socket._handlers[event]({ callId, ...extra });

        expect(emitter.toUser.calledOnceWith(callerId)).to.be.true;
      });

      it("не участник получает ошибку", async () => {
        const socket = createMockSocket(outsiderId);

        handler.onConnection(socket as any);
        await socket._handlers[event]({ callId, ...extra });

        expect(emitter.toUser.called).to.be.false;
        expect(socket.emit.calledWith("error")).to.be.true;
        expect(socket.emit.firstCall.args[1]).to.include({
          code: "CALL_NOT_ACTIVE",
        });
      });

      it("некорректный callId — VALIDATION_ERROR без запроса в БД", async () => {
        const socket = createMockSocket(callerId);
        const ack = sinon.stub();

        handler.onConnection(socket as any);
        await socket._handlers[event]({ ...extra, callId: "call-1" }, ack);

        expect((callRepo as any).findById.called).to.be.false;
        expect(ack.firstCall.args[0].error.code).to.equal("VALIDATION_ERROR");
      });

      it("завершённый звонок не сигналится", async () => {
        (callRepo as any).findById.resolves(makeCall(ECallStatus.ENDED));
        const socket = createMockSocket(callerId);

        handler.onConnection(socket as any);
        await socket._handlers[event]({ callId, ...extra });

        expect(emitter.toUser.called).to.be.false;
        expect(socket.emit.calledWith("error")).to.be.true;
      });
    });
  }

  it("SDP больше предела — VALIDATION_ERROR", async () => {
    const socket = createMockSocket(callerId);
    const ack = sinon.stub();

    handler.onConnection(socket as any);
    await socket._handlers["call:offer"](
      { callId, sdp: "x".repeat(70 * 1024) },
      ack,
    );

    expect(emitter.toUser.called).to.be.false;
    expect(ack.firstCall.args[0].error.details).to.have.property("sdp");
  });

  it("offer без sdp — VALIDATION_ERROR", async () => {
    const socket = createMockSocket(callerId);
    const ack = sinon.stub();

    handler.onConnection(socket as any);
    await socket._handlers["call:offer"]({ callId }, ack);

    expect(ack.firstCall.args[0].error.code).to.equal("VALIDATION_ERROR");
  });
});
