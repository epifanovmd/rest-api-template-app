import { expect } from "chai";
import sinon from "sinon";

import { LiveStore } from "./live-store";

/** Экземпляр без Redis (память процесса) или с подставленным клиентом. */
const createStore = (redis?: unknown): LiveStore => {
  const store = new LiveStore("test:");

  (store as unknown as { _redis: unknown })._redis = redis;

  return store;
};

describe("LiveStore", () => {
  afterEach(() => sinon.restore());

  describe("без Redis — память процесса", () => {
    it("JSON с TTL: живёт до истечения, затем пропадает", async () => {
      const clock = sinon.useFakeTimers({ now: 1_000_000 });
      const store = createStore();

      await store.setJson("a", { n: 1 }, 10);
      expect(await store.getJson("a")).to.deep.equal({ n: 1 });

      clock.tick(11_000);
      expect(await store.getJson("a")).to.equal(null);
    });

    it("setIfAbsent не перезаписывает; incrBy копит и округляет", async () => {
      const store = createStore();

      expect(await store.setIfAbsent("base", 5, 60)).to.equal(5);
      expect(await store.setIfAbsent("base", 9, 60)).to.equal(5);
      expect(await store.incrBy("sum", 2.4, 60)).to.equal(2);
      expect(await store.incrBy("sum", 3, 60)).to.equal(5);

      await store.delete("sum");
      expect(await store.getJson("sum")).to.equal(null);
    });
  });

  describe("с Redis", () => {
    it("ключи — с префиксом модуля, TTL и NX передаются", async () => {
      const redis = {
        get: sinon.stub().resolves("7"),
        set: sinon.stub().resolves("OK"),
        del: sinon.stub().resolves(1),
        incrby: sinon.stub().resolves(12),
        expire: sinon.stub().resolves(1),
      };
      const store = createStore(redis);

      await store.setJson("a", { n: 1 }, 30);
      expect(redis.set.firstCall.args).to.deep.equal([
        "test:a",
        '{"n":1}',
        "EX",
        30,
      ]);

      expect(await store.setIfAbsent("b", 3, 60)).to.equal(7);
      expect(redis.set.secondCall.args).to.deep.equal([
        "test:b",
        "3",
        "EX",
        60,
        "NX",
      ]);

      expect(await store.incrBy("c", 5, 90)).to.equal(12);
      expect(redis.expire.firstCall.args).to.deep.equal(["test:c", 90]);

      await store.delete("a");
      expect(redis.del.firstCall.args).to.deep.equal(["test:a"]);
    });
  });
});
