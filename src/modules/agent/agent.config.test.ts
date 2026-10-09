import { expect } from "chai";

import {
  AGENT_RELEASES_DEFAULTS,
  agentReleasesSchema,
  toAgentReleasesOptions,
} from "./agent.config";

const options = (env: Record<string, string | undefined>) =>
  toAgentReleasesOptions(agentReleasesSchema.parse(env));

describe("настройки агентов: источник выпусков агента", () => {
  it("по умолчанию — выпуски GitHub, версии ^1, ключ автора агента", () => {
    expect(options({})).to.deep.equal({
      github: "epifanovmd/agent",
      range: "^1",
      checkIntervalMs: 3_600_000,
      proxy: false,
      publicKey: AGENT_RELEASES_DEFAULTS.publicKey,
    });
  });

  it("свой репозиторий, диапазон, токен, поток через бэкенд, частота проверки", () => {
    expect(
      options({
        github: "example/agent",
        range: "~1.2",
        token: "ghp_example",
        proxy: "true",
        checkIntervalMs: "60000",
        publicKey: "example-key",
      }),
    ).to.deep.equal({
      github: "example/agent",
      range: "~1.2",
      token: "ghp_example",
      checkIntervalMs: 60_000,
      proxy: true,
      publicKey: "example-key",
    });
  });

  it("ссылка на каталог выпуска важнее GitHub", () => {
    expect(
      options({ url: "https://example.com/agent/v1.1.0", github: "x/y" }),
    ).to.deep.equal({
      url: "https://example.com/agent/v1.1.0",
      checkIntervalMs: 3_600_000,
      proxy: false,
      publicKey: AGENT_RELEASES_DEFAULTS.publicKey,
    });
  });

  it("пустой репозиторий и нет ссылки — источника нет", () => {
    expect(options({ github: "" })).to.equal(undefined);
  });

  it("неверная частота проверки — ошибка настроек", () => {
    expect(() =>
      agentReleasesSchema.parse({ checkIntervalMs: "0" }),
    ).to.throw();
  });
});
