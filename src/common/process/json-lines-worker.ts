import { ChildProcess, spawn } from "child_process";

import {
  attachOutput,
  DEFAULT_KILL_TIMEOUT_MS,
  ProcessError,
  terminate,
} from "./json-lines";

export type TJsonLinesWorkerState = "stopped" | "starting" | "ready";

export interface IJsonLinesWorkerOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Параллельных запросов в процессе; остальные ждут в очереди. */
  concurrency?: number;
  /**
   * Рукопожатие после запуска: запрос с этой задачей должен вернуть
   * результат за `handshakeTimeoutMs`. Без него процесс готов сразу.
   */
  handshakeTask?: string;
  handshakeTimeoutMs?: number;
  /** Предел одного запроса; по умолчанию — без предела. */
  requestTimeoutMs?: number;
  killTimeoutMs?: number;
  logFile?: string;
  onStderr?: (line: string) => void;
  /** Процесс завершился сам (падение); следующий запрос поднимет новый. */
  onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;
}

export interface IWorkerRequestOptions {
  /** Отмена: запрос отклоняется, процессу уходит `{ id, task: "cancel" }`. */
  signal?: AbortSignal;
  onProgress?: (value: number, text?: string) => void;
}

interface IPending {
  resolve: (data: unknown) => void;
  reject: (err: ProcessError) => void;
  onProgress?: (value: number, text?: string) => void;
  cleanup: () => void;
}

interface IQueued {
  task: string;
  params: unknown;
  options: IWorkerRequestOptions;
  resolve: (data: unknown) => void;
  reject: (err: ProcessError) => void;
}

/**
 * Долгоживущий процесс с запросами по id: `{ id, task, params }` в stdin,
 * `{ id, event: "progress" | "result" | "error", … }` из stdout. Для
 * синхронного инференса с низкой задержкой: модель загружается один раз.
 * Процесс поднимается лениво при первом запросе и после падения.
 */
export class JsonLinesWorker {
  private _child: ChildProcess | null = null;
  private _state: TJsonLinesWorkerState = "stopped";
  private _starting: Promise<void> | null = null;
  private _seq = 0;
  private _active = 0;
  private _stopping = false;
  private _info: unknown = null;
  private readonly _pending = new Map<string, IPending>();
  private readonly _queue: IQueued[] = [];

  constructor(private readonly _options: IJsonLinesWorkerOptions) {}

  get state(): TJsonLinesWorkerState {
    return this._state;
  }

  /** Результат рукопожатия (версии, устройство). */
  get info(): unknown {
    return this._info;
  }

  get queued(): number {
    return this._queue.length;
  }

  get active(): number {
    return this._active;
  }

  /** Поднять процесс заранее (иначе — при первом запросе). */
  start(): Promise<void> {
    if (this._state === "ready") return Promise.resolve();

    this._stopping = false;
    this._starting ??= this.spawnChild().finally(() => {
      this._starting = null;
    });

    return this._starting;
  }

  request<T = unknown>(
    task: string,
    params: unknown = {},
    options: IWorkerRequestOptions = {},
  ): Promise<T> {
    if (options.signal?.aborted) {
      return Promise.reject(new ProcessError("ABORTED", "Запрос отменён"));
    }

    return new Promise<T>((resolve, reject) => {
      this._queue.push({
        task,
        params,
        options,
        resolve: resolve as (data: unknown) => void,
        reject,
      });
      this.pump();
    });
  }

  async stop(): Promise<void> {
    this._stopping = true;

    const error = new ProcessError("WORKER_STOPPED", "Процесс остановлен");

    this._queue.splice(0).forEach(item => item.reject(error));
    this.rejectPending(error);

    const child = this._child;

    this._child = null;
    this._state = "stopped";
    if (child) {
      await terminate(
        child,
        this._options.killTimeoutMs ?? DEFAULT_KILL_TIMEOUT_MS,
      );
    }
  }

  private spawnChild(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this._options.command, this._options.args ?? [], {
        cwd: this._options.cwd,
        env: this._options.env ?? process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this._child = child;
      this._state = "starting";

      const output = attachOutput(child, {
        logFile: this._options.logFile,
        onStderr: this._options.onStderr,
        onJson: value => this.onMessage(value),
      });

      child.stdin?.on("error", () => undefined);
      child.once("error", err => {
        this.onChildGone(child, null, null);
        reject(
          new ProcessError(
            "SPAWN_FAILED",
            `Не удалось запустить ${this._options.command}: ${err.message}`,
          ),
        );
      });
      child.once("exit", (exitCode, signal) => {
        output.close();
        this.onChildGone(child, exitCode, signal, output.stderrTail);
        reject(
          new ProcessError("EXIT_CODE", "Процесс завершился при запуске", {
            exitCode,
            signal,
            stderrTail: output.stderrTail,
          }),
        );
      });

      const { handshakeTask } = this._options;

      if (!handshakeTask) {
        this._state = "ready";
        resolve();

        return;
      }

      this.send(handshakeTask, {}, {}, this._options.handshakeTimeoutMs, true)
        .then(info => {
          this._info = info;
          this._state = "ready";
          resolve();
        })
        .catch(err => {
          const error =
            err instanceof ProcessError && err.code === "REQUEST_TIMEOUT"
              ? new ProcessError(
                  "HANDSHAKE_TIMEOUT",
                  `Процесс не ответил за ${this._options.handshakeTimeoutMs} мс`,
                )
              : err;

          void terminate(child, this._options.killTimeoutMs);
          reject(error);
        });
    });
  }

  /** Выдать ожидающие запросы в свободные слоты. */
  private pump(): void {
    if (!this._queue.length) return;

    if (this._state !== "ready") {
      this.start().then(
        () => this.pump(),
        (err: ProcessError) => {
          this._queue.splice(0).forEach(item => item.reject(err));
        },
      );

      return;
    }

    const concurrency = this._options.concurrency ?? 1;

    while (this._queue.length && this._active < concurrency) {
      const item = this._queue.shift() as IQueued;

      this._active += 1;
      this.send(
        item.task,
        item.params,
        item.options,
        this._options.requestTimeoutMs,
      )
        .then(item.resolve, item.reject)
        .finally(() => {
          this._active -= 1;
          this.pump();
        });
    }
  }

  private send(
    task: string,
    params: unknown,
    options: IWorkerRequestOptions,
    timeoutMs: number | undefined,
    bypassReady = false,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = this._child;

      if (!child || (!bypassReady && this._state !== "ready")) {
        reject(new ProcessError("WORKER_STOPPED", "Процесс не запущен"));

        return;
      }

      this._seq += 1;

      const id = String(this._seq);
      let timer: NodeJS.Timeout | null = null;
      const onAbort = () => {
        this.write({ id, task: "cancel" });
        this.settle(id)?.reject(new ProcessError("ABORTED", "Запрос отменён"));
      };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      };

      this._pending.set(id, {
        resolve,
        reject,
        onProgress: options.onProgress,
        cleanup,
      });

      if (timeoutMs) {
        timer = setTimeout(() => {
          this.settle(id)?.reject(
            new ProcessError(
              "REQUEST_TIMEOUT",
              `Задача «${task}» не завершилась за ${timeoutMs} мс`,
            ),
          );
        }, timeoutMs);
      }

      options.signal?.addEventListener("abort", onAbort, { once: true });
      this.write({ id, task, params });
    });
  }

  private write(message: Record<string, unknown>): void {
    this._child?.stdin?.write(`${JSON.stringify(message)}\n`);
  }

  /** Снять ожидание запроса; `undefined` — уже снято. */
  private settle(id: string): IPending | undefined {
    const pending = this._pending.get(id);

    if (!pending) return undefined;

    this._pending.delete(id);
    pending.cleanup();

    return pending;
  }

  private onMessage(message: Record<string, unknown>): void {
    const id = typeof message.id === "string" ? message.id : undefined;
    const pending = id ? this._pending.get(id) : undefined;

    if (!id || !pending) return;

    if (message.event === "progress") {
      pending.onProgress?.(
        Number(message.value ?? 0),
        typeof message.text === "string" ? message.text : undefined,
      );
    } else if (message.event === "result") {
      this.settle(id)?.resolve(message.data);
    } else if (message.event === "error") {
      this.settle(id)?.reject(
        new ProcessError(
          typeof message.code === "string" ? message.code : "PROCESS_ERROR",
          typeof message.message === "string"
            ? message.message
            : "Ошибка процесса",
        ),
      );
    }
  }

  private onChildGone(
    child: ChildProcess,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    stderrTail: string[] = [],
  ): void {
    if (this._child !== child) return;

    this._child = null;
    this._state = "stopped";
    this.rejectPending(
      new ProcessError(
        "EXIT_CODE",
        `Процесс завершился (code ${exitCode}, signal ${signal})`,
        { exitCode, signal, stderrTail },
      ),
    );
    if (!this._stopping) this._options.onExit?.(exitCode, signal);
  }

  private rejectPending(error: ProcessError): void {
    for (const id of [...this._pending.keys()]) {
      this.settle(id)?.reject(error);
    }
  }
}
