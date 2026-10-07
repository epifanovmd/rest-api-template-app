import { expect } from "chai";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

import { PROJECT_ROOT } from "../../core/paths";
import {
  ALP_INCOMING,
  AlpEnvelopeSchema,
  AlpHelloSchema,
} from "./agent-link.protocol";

const FIXTURES = join(PROJECT_ROOT, "protocol/alp/v1/fixtures");

const load = (dir: string): [string, unknown][] =>
  readdirSync(join(FIXTURES, dir))
    .filter(file => file.endsWith(".json"))
    .map(file => [
      file,
      JSON.parse(readFileSync(join(FIXTURES, dir, file), "utf8")),
    ]);

describe("ALP v1: эталонные сообщения", () => {
  const incoming = load("a2s");

  it("набор эталонов агента не пуст", () => {
    expect(incoming.length).to.be.greaterThan(10);
  });

  for (const [file, raw] of incoming) {
    it(`a2s/${file} принимается схемой сервера`, () => {
      const envelope = AlpEnvelopeSchema.parse(raw);
      const schema =
        envelope.type === "hello"
          ? AlpHelloSchema
          : ALP_INCOMING[envelope.type]?.schema;

      expect(schema, `нет схемы для ${envelope.type}`).to.exist;

      const parsed = schema!.safeParse(envelope.data);

      expect(parsed.success, JSON.stringify(parsed.error?.issues)).to.be.true;
    });
  }

  it("каждому входящему типу есть эталон", () => {
    const types = new Set(
      incoming.map(([, raw]) => (raw as { type: string }).type),
    );

    for (const type of ["hello", ...Object.keys(ALP_INCOMING)]) {
      expect(types.has(type), `нет эталона ${type}`).to.be.true;
    }
  });

  it("надёжные сообщения в эталонах несут id, потоковые — seq", () => {
    for (const [file, raw] of incoming) {
      const { type, id, seq } = raw as {
        type: string;
        id?: string;
        seq?: number;
      };
      const delivery = ALP_INCOMING[type]?.delivery;

      if (delivery === "reliable" || delivery === "request") {
        expect(id, file).to.be.a("string");
      }
      if (delivery === "stream") expect(seq, file).to.be.a("number");
    }
  });
});
