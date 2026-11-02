import { expect } from "chai";

import { redisKeyPrefix, resolveAppVersion } from "./config";

describe("config: REDIS_KEY_PREFIX", () => {
  it("принимает пустой, один и несколько сегментов", () => {
    for (const value of ["", "rest_api:", "rest_api:e2e:"]) {
      expect(redisKeyPrefix.safeParse(value).success, value).to.equal(true);
    }
  });

  it("отклоняет префикс без `:` на конце и с недопустимыми символами", () => {
    for (const value of ["rest_api", "rest_api:e2e", "rest api:", ":", "a::"]) {
      expect(redisKeyPrefix.safeParse(value).success, value).to.equal(false);
    }
  });
});

describe("config: app.version", () => {
  it("берёт APP_VERSION, если задан", () => {
    expect(
      resolveAppVersion({
        APP_VERSION: "v2.0.0",
        npm_package_version: "1.0.0",
      }),
    ).to.equal("v2.0.0");
  });

  it("пустой APP_VERSION — версия пакета, а не пустая строка", () => {
    expect(
      resolveAppVersion({ APP_VERSION: "", npm_package_version: "1.0.0" }),
    ).to.equal("1.0.0");
  });

  it("без обеих переменных — undefined (схема подставит unknown)", () => {
    expect(resolveAppVersion({})).to.equal(undefined);
  });
});
