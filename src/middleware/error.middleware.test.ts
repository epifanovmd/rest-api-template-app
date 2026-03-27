import "reflect-metadata";

import { HttpException } from "@force-dev/utils";
import { ValidateError } from "@tsoa/runtime";
import { expect } from "chai";
import sinon from "sinon";

import * as loggerModule from "../core/logger/logger.service";
import { errorMiddleware, ErrorResponseBody } from "./error.middleware";

const createCtx = () =>
  ({
    status: 200,
    body: null,
    state: { requestId: "test-req" },
    path: "/api/test",
    method: "POST",
  }) as any;

describe("errorMiddleware", () => {
  let loggerStub: sinon.SinonStub;

  beforeEach(() => {
    loggerStub = sinon.stub(loggerModule.logger, "error");
  });

  afterEach(() => {
    sinon.restore();
  });

  // ── Pass-through ─────────────────────────────────────────────────

  it("no error passes through", async () => {
    const ctx = createCtx();

    await errorMiddleware(ctx, sinon.stub().resolves());

    expect(ctx.status).to.equal(200);
    expect(ctx.body).to.be.null;
  });

  // ── ValidateError (tsoa) ─────────────────────────────────────────

  it("ValidateError → 422 with fields in details", async () => {
    const ctx = createCtx();
    const fields = {
      email: { message: "email is required", value: undefined },
      password: { message: "min 6 chars", value: "abc" },
    };

    await errorMiddleware(ctx, sinon.stub().rejects(new ValidateError(fields, "")));
    const body = ctx.body as ErrorResponseBody;

    expect(ctx.status).to.equal(422);
    expect(body.status).to.equal(422);
    expect(body.message).to.equal("Validation Failed");
    expect(body.code).to.equal("VALIDATION_ERROR");
    expect(body.details).to.deep.equal(fields);
  });

  it("ValidateError does not log (it's a client error)", async () => {
    const ctx = createCtx();

    await errorMiddleware(ctx, sinon.stub().rejects(new ValidateError({}, "")));

    expect(loggerStub.called).to.be.false;
  });

  // ── HttpException ────────────────────────────────────────────────

  it("HttpException → status, message, reason as details", async () => {
    const ctx = createCtx();

    await errorMiddleware(
      ctx,
      sinon.stub().rejects(new HttpException("Not Found", 404, { id: "missing" })),
    );
    const body = ctx.body as ErrorResponseBody;

    expect(ctx.status).to.equal(404);
    expect(body.status).to.equal(404);
    expect(body.message).to.equal("Not Found");
    expect(body.details).to.deep.equal({ id: "missing" });
  });

  it("HttpException without reason → details undefined", async () => {
    const ctx = createCtx();

    await errorMiddleware(ctx, sinon.stub().rejects(new HttpException("Gone", 410)));
    const body = ctx.body as ErrorResponseBody;

    expect(body.details).to.be.undefined;
  });

  it("HttpException with Error reason → details is inner message", async () => {
    const ctx = createCtx();

    await errorMiddleware(
      ctx,
      sinon.stub().rejects(new HttpException("Fail", 400, new Error("inner cause"))),
    );
    const body = ctx.body as ErrorResponseBody;

    expect(body.details).to.equal("inner cause");
  });

  it("HttpException with string reason → details is the string", async () => {
    const ctx = createCtx();

    await errorMiddleware(
      ctx,
      sinon.stub().rejects(new HttpException("Bad", 400, "field X invalid")),
    );
    const body = ctx.body as ErrorResponseBody;

    expect(body.details).to.equal("field X invalid");
  });

  it("HttpException preserves error name as code", async () => {
    const ctx = createCtx();
    const err = new HttpException("Nope", 403);

    err.name = "ForbiddenException";

    await errorMiddleware(ctx, sinon.stub().rejects(err));
    const body = ctx.body as ErrorResponseBody;

    expect(body.code).to.equal("ForbiddenException");
  });

  it("HttpException 4xx does not log", async () => {
    const ctx = createCtx();

    await errorMiddleware(ctx, sinon.stub().rejects(new HttpException("X", 400)));

    expect(loggerStub.called).to.be.false;
  });

  it("HttpException 5xx logs", async () => {
    const ctx = createCtx();

    await errorMiddleware(ctx, sinon.stub().rejects(new HttpException("X", 500)));

    expect(loggerStub.calledOnce).to.be.true;
  });

  // ── Generic errors ───────────────────────────────────────────────

  it("Error with statusCode uses it", async () => {
    const ctx = createCtx();
    const err = new Error("Bad Request") as any;

    err.statusCode = 400;

    await errorMiddleware(ctx, sinon.stub().rejects(err));
    const body = ctx.body as ErrorResponseBody;

    expect(ctx.status).to.equal(400);
    expect(body.message).to.equal("Bad Request");
  });

  it("Error with status uses it", async () => {
    const ctx = createCtx();
    const err = new Error("Forbidden") as any;

    err.status = 403;

    await errorMiddleware(ctx, sinon.stub().rejects(err));

    expect(ctx.status).to.equal(403);
  });

  it("Error with fields → details contains fields", async () => {
    const ctx = createCtx();
    const err = new Error("Bad input") as any;

    err.statusCode = 400;
    err.fields = { name: { message: "required" } };

    await errorMiddleware(ctx, sinon.stub().rejects(err));
    const body = ctx.body as ErrorResponseBody;

    expect(body.details).to.deep.equal({ name: { message: "required" } });
  });

  it("Error with errors array → details contains errors", async () => {
    const ctx = createCtx();
    const err = new Error("Zod fail") as any;

    err.statusCode = 400;
    err.errors = [{ path: "email", message: "invalid" }];

    await errorMiddleware(ctx, sinon.stub().rejects(err));
    const body = ctx.body as ErrorResponseBody;

    expect(body.details).to.deep.equal([{ path: "email", message: "invalid" }]);
  });

  it("Error with code → code preserved", async () => {
    const ctx = createCtx();
    const err = new Error("Rate limit") as any;

    err.statusCode = 429;
    err.code = "RATE_LIMITED";

    await errorMiddleware(ctx, sinon.stub().rejects(err));
    const body = ctx.body as ErrorResponseBody;

    expect(body.code).to.equal("RATE_LIMITED");
  });

  // ── 5xx safety ───────────────────────────────────────────────────

  it("5xx hides original message", async () => {
    const ctx = createCtx();

    await errorMiddleware(ctx, sinon.stub().rejects(new Error("DB password leaked")));
    const body = ctx.body as ErrorResponseBody;

    expect(ctx.status).to.equal(500);
    expect(body.message).to.equal("Internal Server Error");
    expect(body.details).to.be.undefined;
    expect(body.code).to.equal("INTERNAL_ERROR");
  });

  it("5xx logs with request context", async () => {
    const ctx = createCtx();

    await errorMiddleware(ctx, sinon.stub().rejects(new Error("crash")));

    expect(loggerStub.calledOnce).to.be.true;
    const logArgs = loggerStub.firstCall.args[0];

    expect(logArgs).to.have.property("requestId", "test-req");
    expect(logArgs).to.have.property("path", "/api/test");
    expect(logArgs).to.have.property("method", "POST");
  });

  it("4xx does NOT log", async () => {
    const ctx = createCtx();
    const err = new Error("Not found") as any;

    err.statusCode = 404;

    await errorMiddleware(ctx, sinon.stub().rejects(err));

    expect(loggerStub.called).to.be.false;
  });

  it("unknown non-Error throw → 500", async () => {
    const ctx = createCtx();

    await errorMiddleware(ctx, sinon.stub().rejects("string throw"));
    const body = ctx.body as ErrorResponseBody;

    expect(ctx.status).to.equal(500);
    expect(body.message).to.equal("Internal Server Error");
  });
});
