import { expect } from "chai";
import sinon from "sinon";

import { ExternalJobService } from "./external-job.service";
import { ExternalSyncJobHandler } from "./external-sync.handler";

describe("ExternalSyncJobHandler", () => {
  it("раз в минуту: просроченные — провалить, ждущие — передать (повторы pg-boss могли кончиться)", async () => {
    const external = {
      failExpired: sinon.stub().resolves(2),
      startQueued: sinon.stub().resolves(),
    };
    const handler = new ExternalSyncJobHandler(
      external as unknown as ExternalJobService,
    );

    expect(await handler.handle()).to.equal(2);
    expect(external.failExpired.calledOnce).to.equal(true);
    expect(external.startQueued.calledOnce).to.equal(true);
  });
});
