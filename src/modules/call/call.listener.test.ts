import "reflect-metadata";

import { expect } from "chai";

import {
  createMockEmitter,
  createMockFileStorage,
  uuid,
  uuid2,
} from "../../test/helpers";
import { FileUrlService } from "../file";
import { CallListener } from "./call.listener";
import { CallInitiatedEvent, CallMissedEvent } from "./events";

describe("CallListener", () => {
  const callerId = uuid();
  const calleeId = uuid2();
  let emitter: ReturnType<typeof createMockEmitter>;
  let handlers: Record<string, Function>;

  const makeCall = () =>
    ({
      id: "call-1",
      callerId,
      calleeId,
      caller: {
        id: callerId,
        profile: {
          firstName: "A",
          avatar: { id: "av-1", key: "files/av-1/o.webp", status: "ready" },
        },
      },
      callee: { id: calleeId, profile: { firstName: "B", avatar: null } },
    }) as any;

  beforeEach(() => {
    emitter = createMockEmitter();
    handlers = {};

    const eventBus = {
      on: (EventClass: { name: string }, handler: Function) => {
        handlers[EventClass.name] = handler;

        return () => {};
      },
    };

    new CallListener(
      eventBus as any,
      emitter as any,
      new FileUrlService(createMockFileStorage() as any),
    ).register();
  });

  it("входящий звонок — вызываемому, аватар звонящего подписан", async () => {
    await handlers.CallInitiatedEvent(new CallInitiatedEvent(makeCall()));

    expect(emitter.toUser.calledOnce).to.be.true;
    expect(emitter.toUser.firstCall.args.slice(0, 2)).to.deep.equal([
      calleeId,
      "call:incoming",
    ]);
    expect(emitter.toUser.firstCall.args[2].caller.avatarUrl).to.equal(
      "https://files.test/files/av-1/o.webp?sig=x",
    );
  });

  it("пропущенный звонок — обеим сторонам", async () => {
    await handlers.CallMissedEvent(new CallMissedEvent(makeCall()));

    expect(emitter.toUser.getCalls().map(c => c.args[0])).to.deep.equal([
      callerId,
      calleeId,
    ]);
  });
});
