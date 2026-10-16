import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { HttpException } from "../../core";
import { ApiKeyError } from "./api-key.errors";
import { ApiKeySecurityScheme } from "./api-key.scheme";
import { scopeSatisfied } from "./api-key.scopes";

const request = (headers: Record<string, string>) => ({ headers }) as any;

const expectCode = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail("должно было упасть");
  } catch (err) {
    expect(err).to.be.instanceOf(HttpException);
    expect((err as HttpException).code).to.equal(code);
  }
};

describe("ApiKeySecurityScheme", () => {
  const keys = { verify: sinon.stub() };
  const scheme = new ApiKeySecurityScheme(keys as any);
  const apiKey = { id: "k1", ownerId: "u1", scopes: ["report:export"] };

  beforeEach(() => {
    keys.verify.reset();
    keys.verify.resolves(apiKey);
  });

  it("без ключа — 401 APIKEY_REQUIRED", async () => {
    await expectCode(
      scheme.authenticate(request({}), []),
      ApiKeyError.codes.REQUIRED,
    );
  });

  it("ключ из X-Api-Key — контекст сервиса со scopes ключа", async () => {
    const ctx = await scheme.authenticate(
      request({ "x-api-key": "abcdefgh.secret" }),
      ["report"],
    );

    expect(keys.verify.calledWith("abcdefgh.secret")).to.be.true;
    expect(ctx).to.deep.equal({
      kind: "service",
      userId: "u1",
      sessionId: "apikey:k1",
      roles: [],
      permissions: ["report:export"],
      emailVerified: true,
    });
  });

  it("ключ из Authorization: ApiKey …", async () => {
    await scheme.authenticate(
      request({ authorization: "ApiKey abcdefgh.secret" }),
      [],
    );
    expect(keys.verify.calledWith("abcdefgh.secret")).to.be.true;
  });

  it("Bearer-токен ключом не считается", async () => {
    await expectCode(
      scheme.authenticate(request({ authorization: "Bearer jwt" }), []),
      ApiKeyError.codes.REQUIRED,
    );
  });

  it("scope не покрыт — 403 APIKEY_SCOPE_DENIED", async () => {
    await expectCode(
      scheme.authenticate(request({ "x-api-key": "k" }), ["billing:read"]),
      ApiKeyError.codes.SCOPE_DENIED,
    );
  });

  it("неверный ключ — ошибка verify пробрасывается", async () => {
    keys.verify.rejects(ApiKeyError.INVALID());
    await expectCode(
      scheme.authenticate(request({ "x-api-key": "k" }), []),
      ApiKeyError.codes.INVALID,
    );
  });
});

describe("scopeSatisfied", () => {
  it("точное совпадение и wildcard", () => {
    expect(scopeSatisfied(["report:export"], "report:export")).to.be.true;
    expect(scopeSatisfied(["report:*"], "report:export")).to.be.true;
    expect(scopeSatisfied(["*"], "report:export")).to.be.true;
    expect(scopeSatisfied(["report:other"], "report:export")).to.be.false;
  });

  it("требование без действия — любой scope домена", () => {
    expect(scopeSatisfied(["report:export"], "report")).to.be.true;
    expect(scopeSatisfied(["report:*"], "report")).to.be.true;
    expect(scopeSatisfied(["reports:x"], "report")).to.be.false;
    expect(scopeSatisfied([], "report")).to.be.false;
  });
});
