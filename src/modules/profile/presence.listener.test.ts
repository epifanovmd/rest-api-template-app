import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { EventBus } from "../../core";
import { createMockEmitter } from "../../test/helpers";
import { UserOfflineEvent, UserOnlineEvent } from "./events";
import { PresenceListener } from "./presence.listener";
import { EPrivacyLevel } from "./privacy-settings.entity";
import { IPresenceAudience } from "./profile.relations";

const flush = () => new Promise(resolve => setImmediate(resolve));

const audienceOf = (
  ids: string[],
): IPresenceAudience & {
  audience: sinon.SinonStub;
} => ({
  audience: sinon.stub().resolves(ids),
  peers: sinon.stub().resolves([]),
});

describe("PresenceListener", () => {
  let eventBus: EventBus;
  let emitter: ReturnType<typeof createMockEmitter>;
  let presence: { setOffline: sinon.SinonStub };

  const setup = (
    showLastOnline: EPrivacyLevel,
    audiences: IPresenceAudience[],
  ) => {
    eventBus = new EventBus();
    emitter = createMockEmitter();
    presence = { setOffline: sinon.stub().resolves() };

    new PresenceListener(
      eventBus,
      emitter as any,
      presence as any,
      { getSettings: sinon.stub().resolves({ showLastOnline }) } as any,
      audiences,
    ).register();
  };

  const recipients = () => emitter.toUser.getCalls().map(c => c.args[0]);

  it("объединяет аудитории модулей без повторов и без самого пользователя", async () => {
    const chats = audienceOf(["p1", "c1"]);
    const contacts = audienceOf(["c1", "c2", "u1"]);

    setup(EPrivacyLevel.CONTACTS, [chats, contacts]);

    eventBus.emit(new UserOnlineEvent("u1"));
    await flush();

    expect(recipients()).to.have.members(["p1", "c1", "c2"]);
    expect(recipients()).to.have.lengthOf(3);
    expect(chats.audience.calledWith("u1", EPrivacyLevel.CONTACTS)).to.be.true;
  });

  it("offline: фиксирует lastOnline и рассылает user:offline", async () => {
    setup(EPrivacyLevel.EVERYONE, [audienceOf(["p1"])]);

    eventBus.emit(new UserOfflineEvent("u1"));
    await flush();

    expect(presence.setOffline.calledWith("u1")).to.be.true;
    expect(emitter.toUser.firstCall.args[1]).to.equal("user:offline");
  });

  it("nobody: аудиторию не спрашивает и никого не уведомляет", async () => {
    const chats = audienceOf(["p1"]);

    setup(EPrivacyLevel.NOBODY, [chats]);

    eventBus.emit(new UserOnlineEvent("u1"));
    await flush();

    expect(chats.audience.called).to.be.false;
    expect(emitter.toUser.called).to.be.false;
  });

  it("без модулей связей — никого не уведомляет", async () => {
    setup(EPrivacyLevel.EVERYONE, []);

    eventBus.emit(new UserOnlineEvent("u1"));
    await flush();

    expect(emitter.toUser.called).to.be.false;
  });
});
