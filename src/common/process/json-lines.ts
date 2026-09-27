import { ChildProcess } from "child_process";
import { createWriteStream, WriteStream } from "fs";
import { createInterface } from "readline";

/** Код ошибки процесса — для ветвления вызывающим. */
export type TProcessErrorCode =
  | "SPAWN_FAILED"
  | "HANDSHAKE_TIMEOUT"
  | "ABORTED"
  | "EXIT_CODE"
  | "PROCESS_ERROR"
  | "WORKER_STOPPED"
  | "REQUEST_TIMEOUT";

/** Ошибка дочернего процесса или сообщённая им самим (`event: "error"`). */
export class ProcessError extends Error {
  constructor(
    public readonly code: TProcessErrorCode | (string & {}),
    message: string,
    public readonly details: {
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
      /** Последние строки stderr — для диагностики. */
      stderrTail?: string[];
    } = {},
  ) {
    super(message);
    this.name = "ProcessError";
  }
}

/** Сколько строк stderr держать для текста ошибки. */
export const STDERR_TAIL_SIZE = 20;
/** Пауза между SIGTERM и SIGKILL по умолчанию. */
export const DEFAULT_KILL_TIMEOUT_MS = 5_000;

export interface IOutputHandlers {
  /** Строка stdout, разобранная как JSON-объект. */
  onJson(value: Record<string, unknown>): void;
  /** Строка stdout, не являющаяся JSON (печать библиотек). */
  onText?(line: string): void;
  onStderr?(line: string): void;
  logFile?: string;
}

/**
 * Подписка на вывод процесса: stdout построчно как JSON, stderr — в
 * обработчик, лог-файл и хвост для ошибок.
 */
export const attachOutput = (
  child: ChildProcess,
  handlers: IOutputHandlers,
): { stderrTail: string[]; close: () => void } => {
  const stderrTail: string[] = [];
  const log: WriteStream | null = handlers.logFile
    ? createWriteStream(handlers.logFile, { flags: "a" })
    : null;

  log?.on("error", () => undefined);

  const writeLog = (line: string) => log?.write(`${line}\n`);

  if (child.stdout) {
    createInterface({ input: child.stdout }).on("line", line => {
      const trimmed = line.trim();

      if (!trimmed) return;

      let value: unknown;

      try {
        value = JSON.parse(trimmed);
      } catch {
        value = undefined;
      }

      if (value && typeof value === "object" && !Array.isArray(value)) {
        handlers.onJson(value as Record<string, unknown>);
      } else {
        writeLog(line);
        handlers.onText?.(line);
      }
    });
  }

  if (child.stderr) {
    createInterface({ input: child.stderr }).on("line", line => {
      stderrTail.push(line);
      if (stderrTail.length > STDERR_TAIL_SIZE) stderrTail.shift();
      writeLog(line);
      handlers.onStderr?.(line);
    });
  }

  return { stderrTail, close: () => log?.end() };
};

/**
 * Остановить процесс: SIGTERM, через `timeoutMs` — SIGKILL. Промис
 * разрешается, когда процесс завершился.
 */
export const terminate = (
  child: ChildProcess,
  timeoutMs = DEFAULT_KILL_TIMEOUT_MS,
): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
};
