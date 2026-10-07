import { expect } from "chai";
import { randomBytes, randomUUID } from "crypto";
import WebSocket from "ws";

import { BASE_URL } from "./harness";

/** Входящее сообщение ALP. */
export interface AlpMessage {
  type: string;
  id?: string;
  re?: string;
  seq?: number;
  data?: any;
}

export interface AgentHello {
  queues?: { name: string; concurrency: number }[];
  commands?: string[];
  jobs?: { jobId: string; attempt: number }[];
}

const LINK_PATH = "/api/v1/agent-link";

const linkUrl = (): string => BASE_URL.replace(/^http/, "ws") + LINK_PATH;

/** Попытка upgrade без установки сессии: HTTP-код отказа. */
export const rejectedUpgrade = (
  headers: Record<string, string>,
  protocols: string[] = ["alp.v1"],
): Promise<number> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(linkUrl(), protocols, { headers });

    ws.on("unexpected-response", (_req, res) => {
      resolve(res.statusCode ?? 0);
      ws.terminate();
    });
    ws.on("open", () => {
      ws.close();
      reject(new Error("upgrade неожиданно принят"));
    });
    ws.on("error", () => undefined);
  });

/**
 * Агент для e2e: настоящий WebSocket по протоколу ALP, очередь входящих
 * сообщений с ожиданием по типу и условию, нумерация потока.
 */
export class TestAgent {
  readonly bootId = randomBytes(8).toString("hex");
  private readonly _inbox: AlpMessage[] = [];
  private readonly _waiters: (() => void)[] = [];
  private _seq = 0;
  private _ws!: WebSocket;
  closeCode: number | null = null;

  constructor(readonly credentials: string) {}

  /** Подключиться и пройти рукопожатие; вернуть `welcome`. */
  async connect(hello: AgentHello = {}): Promise<AlpMessage> {
    this._ws = new WebSocket(linkUrl(), ["alp.v1"], {
      headers: { authorization: `Agent ${this.credentials}` },
    });
    this._ws.on("message", raw => {
      this._inbox.push(JSON.parse(raw.toString()));
      this._waiters.splice(0).forEach(wake => wake());
    });
    this._ws.on("close", code => {
      this.closeCode = code;
      this._waiters.splice(0).forEach(wake => wake());
    });
    await new Promise<void>((resolve, reject) => {
      this._ws.once("open", () => resolve());
      this._ws.once("error", reject);
    });

    this.send("hello", {
      protocols: [1],
      agent: {
        name: "e2e-agent",
        version: "1.0.0",
        sdk: "e2e/1",
        bootId: this.bootId,
        startedAt: Date.now(),
      },
      host: { hostname: "e2e", os: "linux", arch: "amd64", cpus: 2 },
      labels: { suite: "e2e" },
      capabilities: {
        ...(hello.queues && { jobs: { queues: hello.queues } }),
        ...(hello.commands && { commands: { names: hello.commands } }),
      },
      jobs: hello.jobs ?? [],
    });

    return this.next("welcome");
  }

  send(type: string, data: unknown, extra: { id?: string; seq?: number } = {}) {
    this._ws.send(JSON.stringify({ type, ts: Date.now(), ...extra, data }));
  }

  /** Потоковое сообщение: следующий номер `seq`. */
  stream(type: string, data: unknown): number {
    this._seq += 1;
    this.send(type, data, { seq: this._seq });

    return this._seq;
  }

  /** Надёжное сообщение: `id`; вернуть его. */
  reliable(type: string, data: unknown): string {
    const id = randomUUID();

    this.send(type, data, { id });

    return id;
  }

  status(slots: Record<string, number>, jobs: unknown[] = []): number {
    return this.stream("status", {
      state: jobs.length ? "busy" : "idle",
      slots,
      jobs,
      workloads: [],
      outbox: 0,
    });
  }

  /** Дождаться сообщения типа `type` (и условия); забрать его из очереди. */
  async next(
    type: string,
    match: (message: AlpMessage) => boolean = () => true,
    timeoutMs = 10_000,
  ): Promise<AlpMessage> {
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const index = this._inbox.findIndex(m => m.type === type && match(m));

      if (index >= 0) return this._inbox.splice(index, 1)[0];
      if (this.closeCode !== null) {
        expect.fail(`канал закрыт (${this.closeCode}), ждали ${type}`);
      }

      const left = deadline - Date.now();

      if (left <= 0) expect.fail(`не дождались ${type} за ${timeoutMs} мс`);

      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, left);

        this._waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Подтверждение надёжного сообщения `id`. */
  acked(id: string): Promise<AlpMessage> {
    return this.next("ack", m => m.data?.ids?.includes(id));
  }

  /** Дождаться закрытия канала; вернуть код. */
  async closed(timeoutMs = 10_000): Promise<number> {
    const deadline = Date.now() + timeoutMs;

    while (this.closeCode === null) {
      if (Date.now() > deadline) expect.fail("канал не закрылся");
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return this.closeCode;
  }

  close(): void {
    this._ws?.close(1000);
  }
}
