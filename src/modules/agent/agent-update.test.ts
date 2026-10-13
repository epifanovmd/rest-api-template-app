import type { Agent, ReleaseView } from "agent-sdk/server";
import { expect } from "chai";

import { compareVersions, updateCandidates } from "./agent-update";

const agent = (patch: Partial<Agent> = {}): Agent => ({
  id: "a1",
  name: "node-1",
  labels: {},
  online: true,
  revoked: false,
  enrolledAt: 1,
  version: "3.0.0",
  host: { os: "linux", arch: "amd64", hostname: "n1" },
  workers: [],
  ...patch,
});

const release: ReleaseView = {
  version: "1.0.0",
  artifacts: [],
  workers: [
    {
      name: "echo",
      version: "1.1.0",
      os: "linux",
      arch: "amd64",
      file: "echo-1.1.0-linux-amd64.tar.gz",
      sha256: "00",
      url: "/api/v1/agent-link/releases/echo-1.1.0-linux-amd64.tar.gz",
    },
    {
      name: "echo",
      version: "1.2.0",
      os: "linux",
      arch: "amd64",
      file: "echo-1.2.0-linux-amd64.tar.gz",
      sha256: "00",
      url: "/api/v1/agent-link/releases/echo-1.2.0-linux-amd64.tar.gz",
    },
    {
      name: "echo",
      version: "9.0.0",
      os: "linux",
      arch: "arm64",
      file: "echo-9.0.0-linux-arm64.tar.gz",
      sha256: "00",
      url: "/api/v1/agent-link/releases/echo-9.0.0-linux-arm64.tar.gz",
    },
  ],
} as ReleaseView;

describe("updateCandidates: кого можно обновить", () => {
  it("сравнение версий: пре-релиз младше релиза", () => {
    expect(compareVersions("3.0.1", "3.0.0")).to.be.above(0);
    expect(compareVersions("v3.0.0", "3.0.0")).to.equal(0);
    expect(compareVersions("3.0.0-rc.1", "3.0.0")).to.be.below(0);
  });

  it("агент — до версии, которую нашёл сам, если обновляет себя", () => {
    const update = { latest: "3.1.0", checkedAt: 1 };

    expect(updateCandidates([agent({ update })], null).agents).to.deep.equal([
      {
        agentId: "a1",
        name: "node-1",
        online: true,
        current: "3.0.0",
        target: "3.1.0",
        os: "linux",
        arch: "amd64",
        source: "agent",
      },
    ]);
    const external = {
      agent: { version: "3.0.0", updateMode: "external" },
    } as unknown as Agent["hello"];

    expect(
      updateCandidates([agent({ update, hello: external })], null).agents,
    ).to.deep.equal([]);
    expect(
      updateCandidates(
        [agent({ update: { latest: "3.0.0", checkedAt: 1 } })],
        null,
      ).agents,
    ).to.deep.equal([]);
    expect(
      updateCandidates([agent({ update, revoked: true })], null).agents,
    ).to.deep.equal([]);
  });

  it("воркер со сборкой с сервера — до новейшей сборки под платформу агента", () => {
    const workers = [
      { name: "echo", release: true, version: "1.0.0" },
      { name: "manual", version: "1.0.0" },
    ] as Agent["workers"];

    expect(
      updateCandidates([agent({ workers })], release).workers,
    ).to.deep.equal([
      {
        agentId: "a1",
        agentName: "node-1",
        online: true,
        worker: "echo",
        current: "1.0.0",
        target: "1.2.0",
        os: "linux",
        arch: "amd64",
      },
    ]);
    expect(
      updateCandidates(
        [agent({ workers: [{ ...workers[0], version: "1.2.0" }] })],
        release,
      ).workers,
    ).to.deep.equal([]);
  });
});
