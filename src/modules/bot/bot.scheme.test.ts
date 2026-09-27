import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { HttpException } from "../../core";
import { BotError } from "./bot.errors";
import { BotSecurityScheme } from "./bot.scheme";

const request = (headers: Record<string, string>) => ({ headers }) as any;

const expectUnauthorized = async (
  promise: Promise<unknown>,
  code: string = BotError.codes.INVALID_TOKEN,
) => {
  try {
    await promise;
    expect.fail("should have thrown");
  } catch (err) {
    expect(err).to.be.instanceOf(HttpException);
    expect(err).to.include({ status: 401, code });
  }
};

describe("BotSecurityScheme", () => {
  const bots = { findByToken: sinon.stub() };
  const scheme = new BotSecurityScheme(bots as any);

  beforeEach(() => bots.findByToken.reset());

  it("без токена — 401 BOT_TOKEN_REQUIRED", async () => {
    await expectUnauthorized(
      scheme.authenticate(request({})),
      "BOT_TOKEN_REQUIRED",
    );
  });

  it("слишком длинный токен — 401 BOT_INVALID_TOKEN без запроса в БД", async () => {
    await expectUnauthorized(
      scheme.authenticate(request({ "x-bot-token": "x".repeat(257) })),
      "BOT_INVALID_TOKEN",
    );
    expect(bots.findByToken.called).to.be.false;
  });

  it("неизвестный токен — 401 BOT_INVALID_TOKEN", async () => {
    bots.findByToken.resolves(null);
    await expectUnauthorized(
      scheme.authenticate(request({ authorization: "Bot anything" })),
    );
    expect(bots.findByToken.calledOnceWith("anything")).to.be.true;
  });

  it("отключённый бот — 401 BOT_INVALID_TOKEN", async () => {
    bots.findByToken.resolves({ userId: "u-bot", isActive: false });
    await expectUnauthorized(
      scheme.authenticate(request({ "x-bot-token": "t" })),
    );
  });

  it("известный бот — контекст его технического пользователя", async () => {
    bots.findByToken.resolves({ userId: "u-bot", isActive: true });

    const context = await scheme.authenticate(
      request({ "x-bot-token": "valid" }),
    );

    expect(context).to.include({ kind: "bot", userId: "u-bot" });
  });
});
