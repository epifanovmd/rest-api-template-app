import { expect } from "chai";

import { JobHandlerRegistry } from "./job-handler.registry";

const handler = (definition: Record<string, unknown>) =>
  ({ definition, handle: async () => undefined }) as any;

describe("JobHandlerRegistry", () => {
  it("очередь дважды — ошибка регистрации", () => {
    const registry = new JobHandlerRegistry();

    expect(() =>
      registry.register([handler({ queue: "a" }), handler({ queue: "a" })]),
    ).to.throw(/дважды/);
  });

  it("срок выполнения больше суток — понятная ошибка сразу, а не отказ pg-boss при старте", () => {
    expect(() =>
      new JobHandlerRegistry().register([
        handler({ queue: "long", expireInSeconds: 2 * 86_400 }),
      ]),
    ).to.throw(/больше суток/);
  });

  it("аренда внешней задачи дольше срока выполнения — ошибка", () => {
    expect(() =>
      new JobHandlerRegistry().register([
        handler({
          queue: "ext",
          external: true,
          leaseSeconds: 600,
          expireInSeconds: 300,
        }),
      ]),
    ).to.throw(/аренда/);
  });

  it("внешняя очередь всегда видимая", () => {
    const registry = new JobHandlerRegistry();

    registry.register([handler({ queue: "ext", external: true })]);
    expect(registry.definition("ext")).to.include({
      tracked: true,
      external: true,
    });
  });
});
