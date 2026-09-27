import { expect } from "chai";

import { parseRange } from "./http-range";

describe("parseRange", () => {
  it("без заголовка или с мусором — null (файл целиком)", () => {
    expect(parseRange(undefined, 10)).to.equal(null);
    expect(parseRange("items=0-1", 10)).to.equal(null);
    expect(parseRange("bytes=5-1", 10)).to.equal(null);
    expect(parseRange("bytes=0-1,3-4", 10)).to.equal(null);
    expect(parseRange("bytes=-", 10)).to.equal(null);
  });

  it("start-end, открытый конец и суффикс", () => {
    expect(parseRange("bytes=2-4", 10)).to.deep.equal({ start: 2, end: 4 });
    expect(parseRange("bytes=7-", 10)).to.deep.equal({ start: 7, end: 9 });
    expect(parseRange("bytes=-3", 10)).to.deep.equal({ start: 7, end: 9 });
    expect(parseRange("bytes=-30", 10)).to.deep.equal({ start: 0, end: 9 });
    expect(parseRange("bytes=5-100", 10)).to.deep.equal({ start: 5, end: 9 });
  });

  it("начало за концом, нулевой суффикс, пустой файл — unsatisfiable", () => {
    expect(parseRange("bytes=10-", 10)).to.equal("unsatisfiable");
    expect(parseRange("bytes=-0", 10)).to.equal("unsatisfiable");
    expect(parseRange("bytes=0-", 0)).to.equal("unsatisfiable");
  });
});
