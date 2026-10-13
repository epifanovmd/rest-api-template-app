import { expect } from "chai";

import { agentReleasesSchema, toAgentReleasesOptions } from "./agent.config";

const options = (env: Record<string, string | undefined>) =>
  toAgentReleasesOptions(agentReleasesSchema.parse(env));

describe("настройки агентов: откуда берутся сборки агента", () => {
  it("по умолчанию — релизы GitHub, версии — как мажорная версия agent-sdk", () => {
    expect(options({})).to.deep.equal({
      github: "epifanovmd/agent",
      checkIntervalMs: 3_600_000,
      proxy: false,
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
      }),
    ).to.deep.equal({
      github: "example/agent",
      range: "~1.2",
      token: "ghp_example",
      checkIntervalMs: 60_000,
      proxy: true,
    });
  });

  it("ссылка на каталог сборок важнее GitHub", () => {
    expect(
      options({ url: "https://example.com/agent/v1.1.0", github: "x/y" }),
    ).to.deep.equal({
      url: "https://example.com/agent/v1.1.0",
      checkIntervalMs: 3_600_000,
      proxy: false,
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
