import { expect } from "chai";

import { redisKeyPrefix } from "./config";

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
