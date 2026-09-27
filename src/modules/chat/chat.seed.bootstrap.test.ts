import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { config } from "../../config";
import { logger } from "../../core";
import {
  ChatSeedBootstrap,
  SEED_GROUP_NAME,
  SEED_USER_EMAILS,
} from "./chat.seed.bootstrap";

describe("ChatSeedBootstrap", () => {
  let userRepo: { findByEmail: sinon.SinonStub };
  let chatService: {
    createDirectChat: sinon.SinonStub;
    createGroupChat: sinon.SinonStub;
  };
  let chatRepo: { findOne: sinon.SinonStub };
  let messageService: { sendMessage: sinon.SinonStub };
  let seed: ChatSeedBootstrap;

  const users: Record<string, { id: string } | null> = {
    [config.auth.admin.email]: { id: "admin" },
    [SEED_USER_EMAILS[0]]: { id: "alice" },
    [SEED_USER_EMAILS[1]]: { id: "bob" },
    [SEED_USER_EMAILS[2]]: { id: "charlie" },
  };

  beforeEach(() => {
    sinon.stub(logger, "info");
    sinon.stub(logger, "warn");
    userRepo = {
      findByEmail: sinon
        .stub()
        .callsFake(async (email: string) => users[email] ?? null),
    };
    chatService = {
      createDirectChat: sinon
        .stub()
        .callsFake(async (_a: string, b: string) => ({ id: `direct-${b}` })),
      createGroupChat: sinon.stub().resolves({ id: "group" }),
    };
    chatRepo = { findOne: sinon.stub().resolves(null) };
    messageService = { sendMessage: sinon.stub().resolves({}) };
    seed = new ChatSeedBootstrap(
      userRepo as any,
      chatService as any,
      chatRepo as any,
      messageService as any,
    );
  });

  afterEach(() => sinon.restore());

  it("некритичный бутстрапер", () => {
    expect(seed.critical).to.equal(false);
  });

  it("вне development ничего не делает", async () => {
    await seed.initialize();

    expect(userRepo.findByEmail.called).to.be.false;
  });

  it("создаёт два личных чата и группу, наполняет сообщениями", async () => {
    await seed.seed();

    expect(chatService.createDirectChat.calledWith("admin", "alice")).to.be
      .true;
    expect(chatService.createDirectChat.calledWith("admin", "bob")).to.be.true;
    expect(
      chatService.createGroupChat.calledOnceWith("admin", SEED_GROUP_NAME, [
        "alice",
        "bob",
        "charlie",
      ]),
    ).to.be.true;

    const chatIds = new Set(
      messageService.sendMessage.getCalls().map(c => c.args[0]),
    );

    expect([...chatIds]).to.have.members([
      "direct-alice",
      "direct-bob",
      "group",
    ]);
  });

  it("чаты с сообщениями не наполняются повторно", async () => {
    chatRepo.findOne.callsFake(async ({ where }: any) =>
      where.name === SEED_GROUP_NAME
        ? { id: "group" }
        : { id: where.id, lastMessageId: "m-1" },
    );

    await seed.seed();

    expect(chatService.createGroupChat.called).to.be.false;
    expect(messageService.sendMessage.called).to.be.false;
  });

  it("без администратора сид пропускается", async () => {
    userRepo.findByEmail.resolves(null);

    await seed.seed();

    expect(chatService.createDirectChat.called).to.be.false;
    expect(messageService.sendMessage.called).to.be.false;
  });

  it("без charlie группа не создаётся, личные чаты — да", async () => {
    userRepo.findByEmail.callsFake(async (email: string) =>
      email === SEED_USER_EMAILS[2] ? null : (users[email] ?? null),
    );

    await seed.seed();

    expect(chatService.createDirectChat.callCount).to.equal(2);
    expect(chatService.createGroupChat.called).to.be.false;
  });
});
