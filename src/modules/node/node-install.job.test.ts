import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { JobError } from "../../core";
import { INodeInstallJobData, INodeUninstallJobData } from "./node.types";
import { NodeInstallAgentJob } from "./node-install.job";
import { NodeUninstallAgentJob } from "./node-uninstall.job";
import type { ISshExecOptions } from "./ssh-runner";

const WORK_DIR = "/tmp/agent-node.Ab12Cd34";

/** SSH-сессия без сети: команды записываются, вывод и коды — по правилам. */
const fakeSession = (codeOf: (command: string) => number = () => 0) => {
  const execs: { command: string; options?: ISshExecOptions }[] = [];
  const uploads: { path: string; content: string }[] = [];
  const session = {
    connect: sinon.stub().resolves(),
    exec: sinon
      .stub()
      .callsFake(async (command: string, options?: ISshExecOptions) => {
        execs.push({ command, options });
        if (command.startsWith("mktemp")) {
          return { code: 0, stdout: `${WORK_DIR}\n`, stderr: "" };
        }
        options?.onLine?.(`вывод: ${command.slice(0, 12)}`);

        const code = codeOf(command);

        return { code, stdout: "", stderr: code ? "нет прав" : "" };
      }),
    upload: sinon.stub().callsFake(async (path: string, content: Buffer) => {
      uploads.push({ path, content: content.toString() });
    }),
    end: sinon.stub(),
  };

  return { session, execs, uploads };
};

const context = <T>(data: T) => {
  const logs: string[] = [];
  const progress: number[] = [];

  return {
    logs,
    progress,
    ctx: {
      id: "j1",
      queue: "q",
      data,
      attempt: 0,
      signal: new AbortController().signal,
      progress: sinon.stub().callsFake(async (value: number) => {
        progress.push(value);
      }),
      log: sinon.stub().callsFake(async (line: string) => {
        logs.push(line);
      }),
    } as any,
  };
};

const secrets = {
  seal: (plain: string) => `enc:${plain}`,
  open: (sealed: string) => sealed.replace(/^enc:/, ""),
};

const sshData = {
  nodeId: "n1",
  actorId: "u1",
  host: "203.0.113.5",
  port: 22,
  username: "deploy",
  sudo: true,
  passwordEnc: "enc:pw",
  backendUrl: "https://api.example.com",
};

describe("NodeInstallAgentJob", () => {
  const data: INodeInstallJobData = {
    ...sshData,
    tokenId: "t1",
    tokenEnc: "enc:pref.secret",
    workers: ["netprobe"],
  };
  let nodeAgents: Record<string, sinon.SinonStub>;

  beforeEach(() => {
    nodeAgents = { revokeToken: sinon.stub().resolves() };
  });

  it("токен — файлом в рабочий каталог, установщик с сервера, sudo с паролем; журнал построчно", async () => {
    const { session, execs, uploads } = fakeSession();
    const job = new NodeInstallAgentJob(
      nodeAgents as any,
      secrets as any,
      () => session,
    );
    const { ctx, logs, progress } = context(data);

    await job.handle(ctx);

    expect(session.connect.firstCall.args[0]).to.include({
      host: "203.0.113.5",
      username: "deploy",
      password: "pw",
    });
    expect(uploads).to.deep.equal([
      { path: `${WORK_DIR}/token`, content: "pref.secret" },
    ]);

    const commands = execs.map(exec => exec.command);

    expect(commands[1]).to.include(
      "'https://api.example.com/api/v1/agent-link/install.sh'",
    );
    expect(commands[2]).to.match(/^sudo -S -p '' sh -c '/);
    expect(commands[2]).to.include(`--token-file ${WORK_DIR}/token`);
    expect(commands[2]).to.include("--worker");
    expect(commands[2]).to.not.include("pref.secret");
    expect(execs[2].options?.stdin).to.equal("pw\n");
    expect(commands.at(-1)).to.equal(`rm -rf ${WORK_DIR}`);
    expect(logs).to.include("▶ Установка агента");
    expect(logs.some(line => line.startsWith("вывод: "))).to.be.true;
    expect(progress.at(-1)).to.equal(1);
    expect(session.end.calledOnce).to.be.true;
    expect(nodeAgents.revokeToken.called).to.be.false;
  });

  it("шаг с ошибкой — JobError без повторов, токен отозван, каталог удалён", async () => {
    const { session, execs } = fakeSession(command =>
      command.startsWith("sudo") ? 1 : 0,
    );
    const job = new NodeInstallAgentJob(
      nodeAgents as any,
      secrets as any,
      () => session,
    );

    try {
      await job.handle(context(data).ctx);
      expect.fail("должно было упасть");
    } catch (err: any) {
      expect(err).to.be.instanceOf(JobError);
      expect(err.code).to.equal("NODE_SSH_STEP_FAILED");
      expect(err.retryable).to.equal(false);
      expect(err.message).to.include("нет прав");
    }

    expect(nodeAgents.revokeToken.calledOnceWith("t1")).to.be.true;
    expect(execs.at(-1)?.command).to.equal(`rm -rf ${WORK_DIR}`);
    expect(session.end.calledOnce).to.be.true;
  });

  it("SSH не подключился — NODE_INSTALL_FAILED", async () => {
    const { session } = fakeSession();

    session.connect.rejects(new Error("connect ECONNREFUSED"));

    const job = new NodeInstallAgentJob(
      nodeAgents as any,
      secrets as any,
      () => session,
    );

    try {
      await job.handle(context(data).ctx);
      expect.fail("должно было упасть");
    } catch (err: any) {
      expect(err.code).to.equal("NODE_INSTALL_FAILED");
      expect(err.message).to.include("ECONNREFUSED");
    }
    expect(nodeAgents.revokeToken.calledOnce).to.be.true;
  });
});

describe("NodeUninstallAgentJob", () => {
  const data: INodeUninstallJobData = {
    ...sshData,
    username: "root",
    sudo: false,
    purge: true,
  };

  it("--uninstall --purge от root, затем агент отзывается и удаляется", async () => {
    const { session, execs } = fakeSession();
    const nodeAgents = { detach: sinon.stub().resolves() };
    const job = new NodeUninstallAgentJob(
      nodeAgents as any,
      secrets as any,
      () => session,
    );

    await job.handle(context(data).ctx);

    expect(execs[2].command).to.equal(
      `sh ${WORK_DIR}/install.sh --uninstall --purge; code=$?; rm -rf ${WORK_DIR}; exit $code`,
    );
    expect(nodeAgents.detach.calledOnceWith("n1", "u1")).to.be.true;
  });

  it("удаление не удалось — агент остаётся", async () => {
    const { session } = fakeSession(command =>
      command.includes("--uninstall") ? 2 : 0,
    );
    const nodeAgents = { detach: sinon.stub().resolves() };
    const job = new NodeUninstallAgentJob(
      nodeAgents as any,
      secrets as any,
      () => session,
    );

    await job.handle(context(data).ctx).then(
      () => expect.fail("должно было упасть"),
      (err: any) => expect(err.code).to.equal("NODE_SSH_STEP_FAILED"),
    );
    expect(nodeAgents.detach.called).to.be.false;
  });
});
