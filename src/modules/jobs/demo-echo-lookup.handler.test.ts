import "reflect-metadata";

import { expect } from "chai";

import { WorkerRequestError } from "../../core";
import {
  DEMO_ECHO_LOOKUP_MAX_TEXT,
  DemoEchoLookupHandler,
} from "./demo-echo-lookup.handler";

const info = (text: string, labels: Record<string, string> = {}) => ({
  id: "r1",
  agent: { id: "a1", name: "node-1", labels },
  worker: "echo",
  type: "echo.lookup",
  data: { text },
  signal: new AbortController().signal,
});

describe("DemoEchoLookupHandler", () => {
  const handler = new DemoEchoLookupHandler();

  it("префикс — метка узла echoPrefix, без неё — имя агента; только от воркера echo", async () => {
    expect(await handler.handle(info("hi"))).to.deep.equal({
      prefix: "[node-1] ",
    });
    expect(
      await handler.handle(info("hi", { echoPrefix: "» " })),
    ).to.deep.equal({ prefix: "» " });
    expect(handler.workers).to.deep.equal(["echo"]);
  });

  it("слишком длинный текст — отказ с кодом", async () => {
    const err = await handler
      .handle(info("x".repeat(DEMO_ECHO_LOOKUP_MAX_TEXT + 1)))
      .catch(e => e);

    expect(err).to.be.instanceOf(WorkerRequestError);
    expect(err.code).to.equal("ECHO_TEXT_TOO_LONG");
  });
});
