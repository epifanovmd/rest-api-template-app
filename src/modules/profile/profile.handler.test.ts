import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import type { TSocket } from "../socket";
import { ProfileHandler } from "./profile.handler";

const createSocket = () => {
  const handlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
  const socket = {
    on: (event: string, fn: (...args: unknown[]) => Promise<void>) => {
      handlers[event] = fn;
    },
    join: sinon.stub(),
    emit: sinon.stub(),
    data: { userId: "u-1" },
  };

  return {
    socket,
    fire: (event: string, ...args: unknown[]) => handlers[event](...args),
  };
};

describe("ProfileHandler", () => {
  afterEach(() => sinon.restore());

  it("profile:subscribe — вход в комнату и подтверждение ack", async () => {
    const { socket, fire } = createSocket();
    const ack = sinon.stub();

    new ProfileHandler().onConnection(socket as unknown as TSocket);
    await fire("profile:subscribe", undefined, ack);

    expect(socket.join.calledOnceWith("profile")).to.equal(true);
    expect(ack.calledOnceWith({ ok: true })).to.equal(true);
  });

  it("profile:subscribe с данными — отклоняется схемой, в комнату не входит", async () => {
    const { socket, fire } = createSocket();
    const ack = sinon.stub();

    new ProfileHandler().onConnection(socket as unknown as TSocket);
    await fire("profile:subscribe", { room: "admin" }, ack);

    expect(socket.join.called).to.equal(false);
    expect(ack.firstCall.args[0]).to.include({ ok: false });
    expect(ack.firstCall.args[0].error.code).to.equal("VALIDATION_ERROR");
  });
});
