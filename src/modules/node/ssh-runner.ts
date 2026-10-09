import { StringDecoder } from "node:string_decoder";

import { Client, ClientChannel, ConnectConfig } from "ssh2";

/** Итог команды по SSH. */
export interface ISshCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ISshExecOptions {
  timeoutMs?: number;
  /** Строки stdout и stderr по мере поступления. */
  onLine?: (line: string) => void;
  /** Что записать в stdin команды (пароль для `sudo -S`); затем stdin закрывается. */
  stdin?: string;
}

/** SSH-сессия: последовательные команды в одном соединении. */
export interface ISshSession {
  connect(config: ConnectConfig): Promise<void>;
  exec(command: string, options?: ISshExecOptions): Promise<ISshCommandResult>;
  /** Записать файл (права 0600); путь — без пробелов и кавычек. */
  upload(remotePath: string, content: Buffer): Promise<void>;
  end(): void;
}

/** Фабрика SSH-сессий: задачи берут её из DI, тесты подменяют. */
export const SSH_SESSION_FACTORY = Symbol("SshSessionFactory");

export type TSshSessionFactory = () => ISshSession;

const EXEC_TIMEOUT_MS = 300_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 20_000;

/** Построчная разбивка потока: хвост без перевода строки — по `flush`. */
const lineSplitter = (onLine?: (line: string) => void) => {
  const decoder = new StringDecoder("utf8");
  let pending = "";

  return {
    write(chunk: Buffer): string {
      const text = decoder.write(chunk);

      if (onLine) {
        const lines = (pending + text).split("\n");

        pending = lines.pop() ?? "";
        lines.forEach(line => onLine(line.replace(/\r$/, "")));
      }

      return text;
    },
    flush(): void {
      if (onLine && pending) onLine(pending);
      pending = "";
    },
  };
};

/** Тонкая обёртка над ssh2. */
export class SshRunner implements ISshSession {
  private readonly _client = new Client();

  connect(config: ConnectConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this._client
        .once("ready", () => resolve())
        .once("error", reject)
        .connect({ readyTimeout: READY_TIMEOUT_MS, ...config });
    });
  }

  exec(
    command: string,
    { timeoutMs = EXEC_TIMEOUT_MS, onLine, stdin }: ISshExecOptions = {},
  ): Promise<ISshCommandResult> {
    return new Promise((resolve, reject) => {
      let channel: ClientChannel | null = null;
      const timer = setTimeout(() => {
        channel?.close();
        reject(new Error(`Команда не уложилась в ${timeoutMs} мс`));
      }, timeoutMs);

      this._client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(err);

          return;
        }

        channel = stream;

        let stdout = "";
        let stderr = "";
        const out = lineSplitter(onLine);
        const errors = lineSplitter(onLine);

        stream.on("data", (chunk: Buffer) => {
          stdout += out.write(chunk);
        });
        stream.stderr.on("data", (chunk: Buffer) => {
          stderr += errors.write(chunk);
        });
        stream.on("close", (code: number | null) => {
          clearTimeout(timer);
          out.flush();
          errors.flush();
          resolve({ code: code ?? -1, stdout, stderr });
        });
        if (stdin !== undefined) stream.end(stdin);
      });
    });
  }

  upload(remotePath: string, content: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      // umask 077: файл (токен регистрации) читает только владелец.
      const command = `umask 077 && cat > '${remotePath}'`;
      const timer = setTimeout(() => {
        reject(new Error(`Загрузка ${remotePath} не уложилась в срок`));
      }, UPLOAD_TIMEOUT_MS);

      this._client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(err);

          return;
        }

        let stderr = "";

        stream.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        // ssh2 шлёт `close` только после `end` stdout — поток нужно читать.
        stream.resume();
        stream.on("close", (code: number | null) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else {
            reject(new Error(`Загрузка ${remotePath}: код ${code} ${stderr}`));
          }
        });
        stream.end(content);
      });
    });
  }

  end(): void {
    this._client.end();
  }
}
