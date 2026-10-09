import { AgentsError } from "agent-sdk/server";
import { expect } from "chai";

import { HttpException } from "../../core";
import { AgentError, toAgentError, withRetryAfter } from "./agent.errors";

describe("ошибки агентов", () => {
  it("коды SDK → доменные; агент в другом процессе — 503 с retryAfter", () => {
    const notFound = toAgentError(
      new AgentsError("AGENT_NOT_FOUND", "нет", 404),
    ) as HttpException;
    const elsewhere = toAgentError(
      new AgentsError("AGENT_ELSEWHERE", "там", 421),
    ) as HttpException;
    const worker = toAgentError(
      new AgentsError("WORKER_UNAVAILABLE", "не отвечает", 502),
    ) as HttpException;

    expect(notFound.code).to.equal(AgentError.codes.NOT_FOUND);
    expect([elsewhere.status, elsewhere.code]).to.deep.equal([
      503,
      AgentError.codes.ELSEWHERE,
    ]);
    expect([worker.status, worker.code]).to.deep.equal([
      502,
      "WORKER_UNAVAILABLE",
    ]);
  });

  it("withRetryAfter: заголовок Retry-After только для AGENT_ELSEWHERE", async () => {
    const headers: Record<string, string> = {};
    const set = (name: string, value: string) => {
      headers[name] = value;
    };

    await withRetryAfter(set, () =>
      Promise.reject(AgentError.ELSEWHERE()),
    ).catch(() => undefined);
    expect(headers["Retry-After"]).to.equal("2");
  });
});
