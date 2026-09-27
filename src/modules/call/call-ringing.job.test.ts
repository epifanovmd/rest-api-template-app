import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { logger } from "../../core";
import { CALL_RINGING_TIMEOUT_QUEUE } from "./call.service";
import {
  CallRingingSweepJobHandler,
  CallRingingTimeoutJobHandler,
} from "./call-ringing.job";

describe("задачи таймаута звонка", () => {
  let callService: {
    expireRingingCall: sinon.SinonStub;
    expireRingingCalls: sinon.SinonStub;
  };

  beforeEach(() => {
    callService = {
      expireRingingCall: sinon.stub().resolves(true),
      expireRingingCalls: sinon.stub().resolves(0),
    };
  });

  afterEach(() => sinon.restore());

  it("отложенная задача переводит в MISSED свой звонок", async () => {
    const handler = new CallRingingTimeoutJobHandler(callService as any);

    const result = await handler.handle({ data: { callId: "c-1" } } as any);

    expect(handler.definition.queue).to.equal(CALL_RINGING_TIMEOUT_QUEUE);
    expect(handler.definition.cron).to.be.undefined;
    expect(callService.expireRingingCall.calledOnceWith("c-1")).to.be.true;
    expect(result).to.be.true;
  });

  it("периодический проход — cron раз в минуту по всем просроченным", async () => {
    const handler = new CallRingingSweepJobHandler(callService as any);

    sinon.stub(logger, "info");
    callService.expireRingingCalls.resolves(2);

    expect(handler.definition.cron).to.equal("* * * * *");
    expect(await handler.handle()).to.equal(2);
  });
});
