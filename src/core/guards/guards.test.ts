import "reflect-metadata";

import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import { expect } from "chai";

import { ApiKeyGuard } from "./api-key.guard";
import { IpWhitelistGuard } from "./ip-whitelist.guard";
import { RequireHttpsGuard } from "./require-https.guard";

const createCtx = (overrides: Record<string, any> = {}) =>
  ({
    ip: "1.2.3.4",
    request: { headers: {}, protocol: "http" },
    headers: {},
    secure: false,
    ...overrides,
  }) as any;

describe("ApiKeyGuard", () => {
  const VALID_KEY = "my-secret-key";

  it("valid key returns true", () => {
    const Guard = ApiKeyGuard(VALID_KEY);
    const guard = new Guard();
    const ctx = createCtx({ headers: { "x-api-key": VALID_KEY } });

    expect(guard.process(ctx)).to.be.true;
  });

  it("missing key throws UnauthorizedException", () => {
    const Guard = ApiKeyGuard(VALID_KEY);
    const guard = new Guard();
    const ctx = createCtx();

    expect(() => guard.process(ctx)).to.throw(UnauthorizedException);
  });

  it("wrong key throws UnauthorizedException", () => {
    const Guard = ApiKeyGuard(VALID_KEY);
    const guard = new Guard();
    const ctx = createCtx({ headers: { "x-api-key": "wrong" } });

    expect(() => guard.process(ctx)).to.throw(UnauthorizedException);
  });

  it("custom header name works", () => {
    const Guard = ApiKeyGuard(VALID_KEY, "x-custom-key");
    const guard = new Guard();
    const ctx = createCtx({ headers: { "x-custom-key": VALID_KEY } });

    expect(guard.process(ctx)).to.be.true;
  });
});

describe("RequireHttpsGuard", () => {
  it("ctx.secure=true passes", () => {
    const guard = new RequireHttpsGuard();
    const ctx = createCtx({ secure: true });

    expect(guard.process(ctx)).to.be.true;
  });

  it("x-forwarded-proto=https passes", () => {
    const guard = new RequireHttpsGuard();
    const ctx = createCtx({
      request: { headers: { "x-forwarded-proto": "https" }, protocol: "http" },
    });

    expect(guard.process(ctx)).to.be.true;
  });

  it("ctx.request.protocol=https passes", () => {
    const guard = new RequireHttpsGuard();
    const ctx = createCtx({
      request: { headers: {}, protocol: "https" },
    });

    expect(guard.process(ctx)).to.be.true;
  });

  it("HTTP throws ForbiddenException", () => {
    const guard = new RequireHttpsGuard();
    const ctx = createCtx();

    expect(() => guard.process(ctx)).to.throw(ForbiddenException);
  });
});

describe("IpWhitelistGuard", () => {
  const ALLOWED = ["10.0.0.1", "10.0.0.2"];

  it("allowed IP passes", () => {
    const Guard = IpWhitelistGuard(ALLOWED);
    const guard = new Guard();
    const ctx = createCtx({ ip: "10.0.0.1" });

    expect(guard.process(ctx)).to.be.true;
  });

  it("disallowed IP throws ForbiddenException", () => {
    const Guard = IpWhitelistGuard(ALLOWED);
    const guard = new Guard();
    const ctx = createCtx({ ip: "192.168.0.1" });

    expect(() => guard.process(ctx)).to.throw(ForbiddenException);
  });

  it("x-forwarded-for header (string) uses first IP", () => {
    const Guard = IpWhitelistGuard(ALLOWED);
    const guard = new Guard();
    const ctx = createCtx({
      ip: "192.168.0.1",
      request: { headers: { "x-forwarded-for": "10.0.0.1" }, protocol: "http" },
    });

    expect(guard.process(ctx)).to.be.true;
  });

  it("x-forwarded-for header (array) uses first element", () => {
    const Guard = IpWhitelistGuard(ALLOWED);
    const guard = new Guard();
    const ctx = createCtx({
      ip: "192.168.0.1",
      request: {
        headers: { "x-forwarded-for": ["10.0.0.1, 172.16.0.1", "other"] },
        protocol: "http",
      },
    });

    expect(guard.process(ctx)).to.be.true;
  });

  it("comma-separated forwarded IPs uses first", () => {
    const Guard = IpWhitelistGuard(ALLOWED);
    const guard = new Guard();
    const ctx = createCtx({
      ip: "192.168.0.1",
      request: {
        headers: { "x-forwarded-for": "10.0.0.2, 172.16.0.1" },
        protocol: "http",
      },
    });

    expect(guard.process(ctx)).to.be.true;
  });

  it("no forwarded header uses ctx.ip", () => {
    const Guard = IpWhitelistGuard(ALLOWED);
    const guard = new Guard();
    const ctx = createCtx({ ip: "10.0.0.2" });

    expect(guard.process(ctx)).to.be.true;
  });
});
