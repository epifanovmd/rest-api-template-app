import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { logger } from "../../core";
import { WorkspaceRoleCache } from "./workspace-role.cache";

const WS = "00000000-0000-0000-0000-00000000000a";
const USER = "00000000-0000-0000-0000-000000000001";

/** Минимальный Redis в памяти: get/set EX/del. */
const createFakeRedis = () => {
  const store = new Map<string, string>();

  return {
    store,
    get: sinon.stub().callsFake(async (key: string) => store.get(key) ?? null),
    set: sinon.stub().callsFake(async (key: string, value: string) => {
      store.set(key, value);

      return "OK";
    }),
    del: sinon.stub().callsFake(async (...keys: string[]) => {
      keys.forEach(key => store.delete(key));

      return keys.length;
    }),
  };
};

describe("WorkspaceRoleCache", () => {
  afterEach(() => sinon.restore());

  describe("без Redis (в памяти)", () => {
    it("промах — undefined, после set — роль", async () => {
      const cache = new WorkspaceRoleCache(() => undefined);

      expect(await cache.get(WS, USER)).to.equal(undefined);
      await cache.set(WS, USER, "editor");
      expect(await cache.get(WS, USER)).to.equal("editor");
    });

    it("кэширует «не участник» как null", async () => {
      const cache = new WorkspaceRoleCache(() => undefined);

      await cache.set(WS, USER, null);
      expect(await cache.get(WS, USER)).to.equal(null);
    });

    it("запись истекает через 30 с", async () => {
      const clock = sinon.useFakeTimers({ now: 1_000_000 });
      const cache = new WorkspaceRoleCache(() => undefined);

      await cache.set(WS, USER, "admin");
      clock.tick(29_000);
      expect(await cache.get(WS, USER)).to.equal("admin");
      clock.tick(2_000);
      expect(await cache.get(WS, USER)).to.equal(undefined);
    });

    it("invalidate удаляет роль", async () => {
      const cache = new WorkspaceRoleCache(() => undefined);

      await cache.set(WS, USER, "viewer");
      await cache.invalidate(WS, [USER]);
      expect(await cache.get(WS, USER)).to.equal(undefined);
    });
  });

  describe("с Redis", () => {
    it("пишет с TTL 30 с и читает общий ключ", async () => {
      const redis = createFakeRedis();
      const cache = new WorkspaceRoleCache(() => redis as any);

      await cache.set(WS, USER, "owner");

      expect(redis.set.firstCall.args).to.deep.equal([
        `workspace:role:${WS}:${USER}`,
        "owner",
        "EX",
        30,
      ]);
      expect(await cache.get(WS, USER)).to.equal("owner");
    });

    it("invalidate удаляет ключи всех пользователей одним DEL", async () => {
      const redis = createFakeRedis();
      const cache = new WorkspaceRoleCache(() => redis as any);

      await cache.invalidate(WS, [USER, "u2"]);

      expect(redis.del.calledOnce).to.equal(true);
      expect(redis.del.firstCall.args).to.have.length(2);
    });

    it("мусор в ключе — промах", async () => {
      const redis = createFakeRedis();

      redis.store.set(`workspace:role:${WS}:${USER}`, "superhero");

      const cache = new WorkspaceRoleCache(() => redis as any);

      expect(await cache.get(WS, USER)).to.equal(undefined);
    });

    it("сбой Redis — промах, а не ошибка", async () => {
      const warn = sinon.stub(logger, "warn");
      const redis = createFakeRedis();

      redis.get.rejects(new Error("down"));
      redis.set.rejects(new Error("down"));
      redis.del.rejects(new Error("down"));

      const cache = new WorkspaceRoleCache(() => redis as any);

      expect(await cache.get(WS, USER)).to.equal(undefined);
      await cache.set(WS, USER, "viewer");
      await cache.invalidate(WS, [USER]);
      expect(warn.callCount).to.equal(3);
    });
  });
});
