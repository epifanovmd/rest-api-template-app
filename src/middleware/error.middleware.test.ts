import "reflect-metadata";

import { HttpException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import * as loggerModule from "../core/logger/logger.service";
import { errorMiddleware } from "./error.middleware";

const createCtx = () =>
  ({
    status: 200,
    body: null,
    state: { requestId: "test" },
  }) as any;

describe("errorMiddleware", () => {
  let loggerStub: sinon.SinonStub;

  beforeEach(() => {
    loggerStub = sinon.stub(loggerModule.logger, "error");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("no error passes through", async () => {
    const ctx = createCtx();
    const next = sinon.stub().resolves();

    await errorMiddleware(ctx, next);

    expect(ctx.status).to.equal(200);
    expect(ctx.body).to.be.null;
  });

  it("HttpException sets status and body from exception", async () => {
    const ctx = createCtx();
    const next = sinon.stub().rejects(new HttpException("Not Found", 404));

    await errorMiddleware(ctx, next);

    expect(ctx.status).to.equal(404);
    expect(ctx.body).to.be.instanceOf(HttpException);
    expect((ctx.body as HttpException).message).to.equal("Not Found");
    expect((ctx.body as HttpException).status).to.equal(404);
  });

  it("Error with statusCode uses statusCode", async () => {
    const ctx = createCtx();
    const err = new Error("Bad Request") as any;

    err.statusCode = 400;
    const next = sinon.stub().rejects(err);

    await errorMiddleware(ctx, next);

    expect(ctx.status).to.equal(400);
  });

  it("Error with status uses status", async () => {
    const ctx = createCtx();
    const err = new Error("Forbidden") as any;

    err.status = 403;
    const next = sinon.stub().rejects(err);

    await errorMiddleware(ctx, next);

    expect(ctx.status).to.equal(403);
  });

  it("unknown error returns 500", async () => {
    const ctx = createCtx();
    const next = sinon.stub().rejects(new Error("something broke"));

    await errorMiddleware(ctx, next);

    expect(ctx.status).to.equal(500);
  });

  it("4xx error uses original message", async () => {
    const ctx = createCtx();
    const err = new Error("Custom client error") as any;

    err.statusCode = 422;
    const next = sinon.stub().rejects(err);

    await errorMiddleware(ctx, next);

    expect(ctx.status).to.equal(422);
    expect((ctx.body as HttpException).message).to.equal("Custom client error");
  });

  it("5xx error hides message with Internal Server Error", async () => {
    const ctx = createCtx();
    const err = new Error("secret DB details") as any;

    err.statusCode = 502;
    const next = sinon.stub().rejects(err);

    await errorMiddleware(ctx, next);

    expect(ctx.status).to.equal(502);
    expect((ctx.body as HttpException).message).to.equal(
      "Internal Server Error",
    );
  });
});
