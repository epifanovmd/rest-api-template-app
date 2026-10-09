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

  it("внешней очереди нужен тип задачи воркера", () => {
    const registry = new JobHandlerRegistry();

    expect(() =>
      registry.register([handler({ queue: "ext", external: true })]),
    ).to.throw(/job\.type/);

    registry.register([
      handler({
        queue: "ext2",
        external: true,
        job: { type: "report.build", worker: "report" },
      }),
    ]);
    expect(registry.definition("ext2")?.job).to.deep.equal({
      type: "report.build",
      worker: "report",
    });
  });

  it("внешняя очередь всегда видимая", () => {
    const registry = new JobHandlerRegistry();

    registry.register([
      handler({ queue: "ext", external: true, job: { type: "x.run" } }),
    ]);
    expect(registry.definition("ext")).to.include({
      tracked: true,
      external: true,
    });
  });
});
