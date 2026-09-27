import { spawn } from "child_process";

import {
  attachOutput,
  DEFAULT_KILL_TIMEOUT_MS,
  ProcessError,
  terminate,
} from "./json-lines";

/**
 * Событие процесса — строка stdout в JSON. Соглашение: `{ event: "result",
 * data }` — результат, `{ event: "error", message, code? }` — ошибка;
 * остальные события (прогресс, лог) передаются в `onEvent` как есть.
 */
export type TJsonLinesEvent = Record<string, unknown> & { event?: string };

export interface IRunJsonLinesOptions<E extends TJsonLinesEvent> {
  command: string;
  args?: string[];
  cwd?: string;
  /** Полное окружение процесса; по умолчанию — окружение родителя. */
  env?: NodeJS.ProcessEnv;
  /** Вход: объект пишется одной JSON-строкой в stdin, затем stdin закрывается. */
  input?: unknown;
  /** Отмена: SIGTERM, через `killTimeoutMs` — SIGKILL. */
  signal?: AbortSignal;
  onEvent?: (event: E) => void;
  /** Первое событие должно прийти за этот срок, иначе процесс убивается. */
  handshakeTimeoutMs?: number;
  killTimeoutMs?: number;
  /** stderr и не-JSON строки stdout дописываются в этот файл. */
  logFile?: string;
  onStderr?: (line: string) => void;
}

export interface IJsonLinesResult<R = unknown> {
  /** `data` последнего события `result`; `undefined` — его не было. */
  result: R | undefined;
  /** Сколько JSON-событий пришло. */
  events: number;
}

/**
 * Запустить процесс-задачу с протоколом JSON-lines в stdout. Промис
 * разрешается при коде выхода 0 и отклоняется `ProcessError` при ошибке
 * запуска, отмене, таймауте рукопожатия, ненулевом коде выхода или событии
 * `error`.
 */
export const runJsonLinesProcess = <
  R = unknown,
  E extends TJsonLinesEvent = TJsonLinesEvent,
>(
  options: IRunJsonLinesOptions<E>,
): Promise<IJsonLinesResult<R>> =>
  new Promise((resolve, reject) => {
    const killTimeoutMs = options.killTimeoutMs ?? DEFAULT_KILL_TIMEOUT_MS;

    if (options.signal?.aborted) {
      reject(new ProcessError("ABORTED", "Процесс отменён до запуска"));

      return;
    }

    const child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let events = 0;
    let result: R | undefined;
    let reported: ProcessError | null = null;
    let failure: ProcessError | null = null;
    let settled = false;
    let handshakeTimer: NodeJS.Timeout | null = null;

    const stop = (error: ProcessError) => {
      failure ??= error;
      void terminate(child, killTimeoutMs);
    };
    const onAbort = () => stop(new ProcessError("ABORTED", "Процесс отменён"));
    const clearHandshake = () => {
      if (handshakeTimer) clearTimeout(handshakeTimer);
      handshakeTimer = null;
    };

    const output = attachOutput(child, {
      logFile: options.logFile,
      onStderr: options.onStderr,
      onJson: value => {
        const event = value as E;

        events += 1;
        clearHandshake();

        if (event.event === "result") {
          result = event.data as R;
        } else if (event.event === "error") {
          reported = new ProcessError(
            typeof event.code === "string" ? event.code : "PROCESS_ERROR",
            typeof event.message === "string"
              ? event.message
              : "Процесс сообщил об ошибке",
          );
        }

        options.onEvent?.(event);
      },
    });

    const finish = (error: ProcessError | null) => {
      if (settled) return;
      settled = true;
      clearHandshake();
      options.signal?.removeEventListener("abort", onAbort);
      output.close();

      if (error) reject(error);
      else resolve({ result, events });
    };

    if (options.handshakeTimeoutMs) {
      handshakeTimer = setTimeout(
        () =>
          stop(
            new ProcessError(
              "HANDSHAKE_TIMEOUT",
              `Процесс не ответил за ${options.handshakeTimeoutMs} мс`,
            ),
          ),
        options.handshakeTimeoutMs,
      );
    }

    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", err =>
      finish(
        new ProcessError(
          "SPAWN_FAILED",
          `Не удалось запустить ${options.command}: ${err.message}`,
        ),
      ),
    );

    child.on("close", (exitCode, signal) => {
      const details = { exitCode, signal, stderrTail: output.stderrTail };

      if (failure) {
        finish(new ProcessError(failure.code, failure.message, details));
      } else if (reported) {
        finish(new ProcessError(reported.code, reported.message, details));
      } else if (exitCode !== 0) {
        finish(
          new ProcessError(
            "EXIT_CODE",
            `Процесс завершился с кодом ${exitCode ?? signal}`,
            details,
          ),
        );
      } else {
        finish(null);
      }
    });

    child.stdin?.on("error", () => undefined);

    if (options.input !== undefined) {
      child.stdin?.write(`${JSON.stringify(options.input)}\n`);
    }
    child.stdin?.end();
  });
