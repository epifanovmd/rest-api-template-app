import "reflect-metadata";

import { expect } from "chai";

import { escapeLikePattern } from "./message.repository";

describe("escapeLikePattern", () => {
  it("экранирует % и _, чтобы они искались буквально", () => {
    expect(escapeLikePattern("100%")).to.equal("100\\%");
    expect(escapeLikePattern("a_b")).to.equal("a\\_b");
  });

  it("экранирует сам символ экранирования", () => {
    expect(escapeLikePattern("c:\\dir")).to.equal("c:\\\\dir");
  });

  it("обычный текст не меняет", () => {
    expect(escapeLikePattern("привет")).to.equal("привет");
  });
});
