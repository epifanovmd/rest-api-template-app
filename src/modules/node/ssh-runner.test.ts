import { Duplex, PassThrough } from "node:stream";

import { expect } from "chai";

import { SshRunner } from "./ssh-runner";

type TExec = (
  command: string,
  callback: (err: Error | undefined, stream: unknown) => void,
) => void;

const clientOf = (runner: SshRunner) =>
  (runner as unknown as { _client: { exec: TExec } })._client;

/**
 * Канал как в ssh2: после записи удалённая сторона закрывает stdout, а
 * `close` приходит только после `end` читаемой стороны.
 */
const uploadChannel = (received: Buffer[]) => {
  const channel = new Duplex({
    read: () => undefined,
    write: (chunk: Buffer, _encoding, done) => {
      received.push(chunk);
      done();
    },
    final: done => {
      channel.push(null);
      done();
    },
    emitClose: false,
  }) as Duplex & { stderr: PassThrough };

  channel.stderr = new PassThrough();
  channel.once("end", () => channel.emit("close", 0));

  return channel;
};

describe("SshRunner", () => {
  it("exec: строки stdout и stderr по мере поступления, хвост — в конце, stdin — команде", async () => {
    const runner = new SshRunner();
    const channel = new PassThrough() as PassThrough & {
      stderr: PassThrough;
    };
    const stdin: Buffer[] = [];

    channel.stderr = new PassThrough();
    channel.on("data", () => undefined);
    (channel as any).end = (data: string) => stdin.push(Buffer.from(data));
    clientOf(runner).exec = (_command, callback) =>
      callback(undefined, channel);

    const lines: string[] = [];
    const done = runner.exec("cmd", {
      timeoutMs: 1000,
      onLine: line => lines.push(line),
      stdin: "secret\n",
    });

    channel.emit("data", Buffer.from("▶ шаг 1\n▶ ша"));
    expect(lines).to.deep.equal(["▶ шаг 1"]);

    // Кириллица, разрезанная между пакетами посреди символа.
    const tail = Buffer.from("г 2\r\nхвост");

    channel.emit("data", tail.subarray(0, 1));
    channel.emit("data", tail.subarray(1));
    channel.stderr.emit("data", Buffer.from("ошибка\n"));
    channel.emit("close", 3);

    const result = await done;

    expect(lines).to.deep.equal(["▶ шаг 1", "▶ шаг 2", "ошибка", "хвост"]);
    expect(result).to.deep.include({ code: 3, stderr: "ошибка\n" });
    expect(Buffer.concat(stdin).toString()).to.equal("secret\n");
  });

  it("upload: содержимое в stdin команды с umask 077", async () => {
    const runner = new SshRunner();
    const received: Buffer[] = [];
    const commands: string[] = [];

    clientOf(runner).exec = (command, callback) => {
      commands.push(command);
      callback(undefined, uploadChannel(received));
    };

    await runner.upload("/tmp/agent-node.x/token", Buffer.from("tok"));

    expect(Buffer.concat(received).toString()).to.equal("tok");
    expect(commands[0]).to.equal(
      "umask 077 && cat > '/tmp/agent-node.x/token'",
    );
  });
});
