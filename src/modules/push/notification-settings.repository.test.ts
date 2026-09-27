import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { NotificationSettingsRepository } from "./notification-settings.repository";

describe("NotificationSettingsRepository.upsertSettings", () => {
  it("should upsert by user_id instead of find-then-insert", async () => {
    const repo = Object.create(
      NotificationSettingsRepository.prototype,
    ) as NotificationSettingsRepository;
    const saved = { userId: "u1", muteAll: true };
    const upsert = sinon.stub().resolves();
    const findOneOrFail = sinon.stub().resolves(saved);
    const createAndSave = sinon.stub();

    Object.assign(repo, { upsert, findOneOrFail, createAndSave });

    const result = await repo.upsertSettings("u1", { muteAll: true });

    expect(upsert.calledOnce).to.be.true;
    expect(upsert.firstCall.args[0]).to.deep.equal({
      userId: "u1",
      muteAll: true,
    });
    expect(upsert.firstCall.args[1]).to.deep.include({
      conflictPaths: ["userId"],
    });
    expect(createAndSave.called).to.be.false;
    expect(result).to.equal(saved);
  });
});
