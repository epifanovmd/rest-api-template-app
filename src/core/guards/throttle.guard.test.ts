import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { ThrottleGuard } from "./throttle.guard";

describe("ThrottleGuard", () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  const createCtx = (ip = "127.0.0.1") => ({
    ip,
    set: sinon.stub(),
    throw: sinon.stub().callsFake((status: number, msg: string) => {
      const err = new Error(msg) as any;

      err.status = status;
      throw err;
    }),
  });

  it("first request passes", () => {
    const GuardClass = ThrottleGuard(5, 60_000);
    const guard = new GuardClass();
    const ctx = createCtx();

    const result = guard.process(ctx as any);

    expect(result).to.be.true;
  });

  it("requests within limit pass", () => {
    const GuardClass = ThrottleGuard(3, 60_000);
    const guard = new GuardClass();
    const ctx = createCtx();

    expect(guard.process(ctx as any)).to.be.true;
    expect(guard.process(ctx as any)).to.be.true;
    expect(guard.process(ctx as any)).to.be.true;
  });

  it("requests exceeding limit throws 429 with Retry-After header", () => {
    const GuardClass = ThrottleGuard(2, 60_000);
    const guard = new GuardClass();
    const ctx = createCtx();

    guard.process(ctx as any);
    guard.process(ctx as any);

    try {
      guard.process(ctx as any);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.status).to.equal(429);
      expect(ctx.set.calledWith("Retry-After")).to.be.true;
    }
  });

  it("after window expires, counter resets", () => {
    const GuardClass = ThrottleGuard(1, 10_000);
    const guard = new GuardClass();
    const ctx = createCtx();

    guard.process(ctx as any);

    // Advance past the window
    clock.tick(10_001);

    // Should pass again - window reset
    const result = guard.process(ctx as any);

    expect(result).to.be.true;
  });

  it("different IPs have independent counters", () => {
    const GuardClass = ThrottleGuard(1, 60_000);
    const guard = new GuardClass();
    const ctx1 = createCtx("10.0.0.1");
    const ctx2 = createCtx("10.0.0.2");

    guard.process(ctx1 as any);
    // ctx1 is now at limit

    // ctx2 should still pass
    const result = guard.process(ctx2 as any);

    expect(result).to.be.true;

    // ctx1 should fail
    try {
      guard.process(ctx1 as any);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.status).to.equal(429);
    }
  });

  it("Retry-After header contains correct seconds", () => {
    const GuardClass = ThrottleGuard(1, 30_000);
    const guard = new GuardClass();
    const ctx = createCtx();

    guard.process(ctx as any);

    // Advance 10 seconds into the window
    clock.tick(10_000);

    try {
      guard.process(ctx as any);
      expect.fail("should have thrown");
    } catch {
      // Remaining: 30000 - 10000 = 20000ms = 20s
      expect(ctx.set.calledWith("Retry-After", "20")).to.be.true;
    }
  });
});
