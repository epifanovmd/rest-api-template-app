import { randomUUID } from "crypto";

import { EventBus, HttpException, logger } from "../../core";
import type { IAgentCapability, IAgentSession } from "./agent.capability";
import { agentConfig } from "./agent.config";
import type { Agent } from "./agent.entity";
import { AgentError } from "./agent.errors";
import type { AgentService } from "./agent.service";
import { AGENT_TOUCH_INTERVAL_MS, EAgentTransport } from "./agent.types";
import type { AgentCapabilityRegistry } from "./agent-capability.registry";
import {
  ALP_INCOMING,
  ALP_PROTOCOLS,
  AlpEnvelopeSchema,
  AlpHelloSchema,
  EAgentLinkClose,
  IAlpCapabilities,
  IAlpMetrics,
  IAlpOutgoing,
  IAlpStatus,
  TAlpEnvelope,
  TAlpHello,
  TAlpOutgoingType,
} from "./agent-link.protocol";
import type {
  AgentPresenceStore,
  IAgentSessionSnapshot,
} from "./agent-presence.store";
import { AgentLiveEvent } from "./events";

/** Канал доставки сессии: WebSocket или пачки HTTP sync. */
export interface IAgentTransport {
  readonly kind: EAgentTransport;
  send(raw: string): void;
  close(code: number, reason: string): void;
}

/** Сервисы, с которыми работает сессия. */
export interface IAgentSessionDeps {
  agents: AgentService;
  presence: AgentPresenceStore;
  capabilities: AgentCapabilityRegistry;
  eventBus: EventBus;
}

/** Подтверждения копятся и уходят одним `ack` через эту паузу. */
const ACK_FLUSH_MS = 20;

/** Наибольшая общая версия протокола; `null` — общей нет. */
export const negotiateProtocol = (offered: number[]): number | null => {
  const common = ALP_PROTOCOLS.filter(version => offered.includes(version));

  return common.length ? Math.max(...common) : null;
};

/** Ошибка обработки → `error` агенту: 4xx — без повтора, иначе — повторить. */
const toAlpError = (err: unknown): IAlpOutgoing["error"] =>
  err instanceof HttpException
    ? {
        code: err.code ?? "ERROR",
        message: err.message,
        retryable: err.status >= 500,
      }
    : {
        code: "INTERNAL",
        message: "Внутренняя ошибка сервера",
        retryable: true,
      };

/**
 * Сессия агента по протоколу ALP, независимая от транспорта: рукопожатие,
 * классы доставки (поток — дедупликация по `seq`, надёжные — `ack` по `id`,
 * запросы — ответ с `re`), маршрутизация по возможностям. Сообщения
 * обрабатываются строго по порядку.
 */
export class AgentSession implements IAgentSession {
  readonly sessionId: string;

  private _hello: TAlpHello | null = null;
  private _protocol = 0;
  private _status: IAlpStatus | null = null;
  private _closed = false;
  private _queue: Promise<void> = Promise.resolve();
  /** Последний принятый номер потока в пределах `bootId` агента. */
  private _lastSeq = 0;
  private _seqDirty = false;
  private readonly _ackIds: string[] = [];
  private _ackTimer: NodeJS.Timeout | null = null;
  private _touchedAt = 0;
  private readonly _helloTimer: NodeJS.Timeout;

  constructor(
    private readonly _agent: Agent,
    private readonly _transport: IAgentTransport,
    private readonly _deps: IAgentSessionDeps,
    private readonly _remoteIp?: string,
    /** Восстанавливаемая сессия (HTTP sync в другом процессе) — её id. */
    sessionId?: string,
  ) {
    this.sessionId = sessionId ?? randomUUID();
    this._helloTimer = setTimeout(
      () => this.close(EAgentLinkClose.Protocol, "hello timeout"),
      agentConfig.helloTimeoutMs,
    );
  }

  get agentId(): string {
    return this._agent.id;
  }

  /** Агент прислал `hello`: сессия была открыта (может быть уже закрыта). */
  get greeted(): boolean {
    return this._hello !== null;
  }

  /** Рукопожатие завершено: сессии можно доставлять поручения. */
  get ready(): boolean {
    return this._hello !== null && !this._closed;
  }

  get hello(): TAlpHello {
    if (!this._hello) throw AgentError.HELLO_REQUIRED();

    return this._hello;
  }

  get status(): IAlpStatus | null {
    return this._status;
  }

  get closed(): boolean {
    return this._closed;
  }

  get transport(): EAgentTransport {
    return this._transport.kind;
  }

  supports(capability: keyof IAlpCapabilities): boolean {
    return this._hello?.capabilities[capability] !== undefined;
  }

  send<T extends TAlpOutgoingType>(
    type: T,
    data: IAlpOutgoing[T],
    re?: string,
  ): void {
    if (this._closed) return;

    this._transport.send(
      JSON.stringify({ type, ...(re && { re }), ts: Date.now(), data }),
    );
  }

  /**
   * Дождаться обработки всего, что уже принято, и отправить накопленные
   * подтверждения сразу (ответ HTTP sync не ждёт таймера склейки).
   */
  async settle(): Promise<void> {
    await this._queue;
    if (this._ackTimer) {
      clearTimeout(this._ackTimer);
      this._ackTimer = null;
    }
    this._enqueue(() => this._flushAck());
    await this._queue;
  }

  /**
   * Восстановить сессию без нового `hello` (HTTP sync попал в другой
   * процесс): сверка не повторяется, возможности доставляют ожидающее.
   */
  resume(snapshot: IAgentSessionSnapshot): Promise<void> {
    clearTimeout(this._helloTimer);
    this._enqueue(async () => {
      const stored = await this._deps.presence.getStreamSeq(this.agentId);

      if (stored?.bootId === snapshot.hello.agent.bootId) {
        this._lastSeq = stored.seq;
      }
      this._hello = snapshot.hello;
      this._protocol = snapshot.protocol;
      this._status = await this._deps.presence.getStatus(this.agentId);
      await this._each(cap =>
        cap.onResume ? cap.onResume(this) : cap.deliver?.(this),
      );
    });

    return this._queue;
  }

  /** Сырое сообщение транспорта — в очередь обработки. */
  receive(raw: string): void {
    this._enqueue(() => this._onRaw(raw));
  }

  /** Сигнал «агенту есть что доставить»: возможности досылают ожидающее. */
  deliver(): void {
    if (!this.ready) return;

    this._enqueue(() => this._each(cap => cap.deliver?.(this)));
  }

  /** Закрыть сессию по инициативе сервера. */
  close(code: number, reason: string): void {
    if (this._closed) return;

    this._transport.close(code, reason);
    this.dispose();
  }

  /** Транспорт закрыт (любой стороной): освободить ресурсы, сообщить возможностям. */
  dispose(): Promise<void> {
    if (this._closed) return this._queue;

    this._closed = true;
    clearTimeout(this._helloTimer);
    if (this._ackTimer) clearTimeout(this._ackTimer);
    this._ackTimer = null;

    const greeted = this._hello !== null;

    // Ждём уже начатую обработку, затем — закрытие возможностей.
    this._queue = this._queue.then(async () => {
      await this._saveSeq();
      if (greeted) await this._each(cap => cap.onClose?.(this));
    });

    return this._queue;
  }

  private _enqueue(task: () => Promise<void>): void {
    this._queue = this._queue
      .then(task)
      .catch(err =>
        logger.error({ err, agentId: this.agentId }, "[Agent] Ошибка сессии"),
      );
  }

  private async _each(
    action: (capability: IAgentCapability) => Promise<void> | undefined,
  ): Promise<void> {
    for (const capability of this._deps.capabilities.all()) {
      try {
        await action(capability);
      } catch (err) {
        logger.error(
          { err, agentId: this.agentId },
          "[Agent] Возможность не обработала событие сессии",
        );
      }
    }
  }

  private async _onRaw(raw: string): Promise<void> {
    if (this._closed) return;

    let envelope: TAlpEnvelope;

    try {
      envelope = AlpEnvelopeSchema.parse(JSON.parse(raw));
    } catch {
      this.close(EAgentLinkClose.Protocol, "invalid envelope");

      return;
    }

    if (!this._hello) {
      if (envelope.type !== "hello") {
        this.close(EAgentLinkClose.Protocol, "hello required");

        return;
      }

      await this._onHello(envelope);

      return;
    }

    await this._onMessage(envelope);
  }

  private async _onHello(envelope: TAlpEnvelope): Promise<void> {
    clearTimeout(this._helloTimer);

    const parsed = AlpHelloSchema.safeParse(envelope.data);

    if (!parsed.success) {
      this.send("error", {
        code: AgentError.codes.MESSAGE_INVALID,
        message: parsed.error.issues.map(issue => issue.message).join("; "),
        retryable: false,
      });
      this.close(EAgentLinkClose.Protocol, "invalid hello");

      return;
    }

    const protocol = negotiateProtocol(parsed.data.protocols);

    if (protocol === null) {
      this.close(EAgentLinkClose.Unsupported, "protocol unsupported");

      return;
    }

    const hello = parsed.data;
    const stored = await this._deps.presence.getStreamSeq(this.agentId);

    if (stored?.bootId === hello.agent.bootId) this._lastSeq = stored.seq;

    this._hello = hello;
    this._protocol = protocol;
    this._touchedAt = Date.now();
    await this._deps.agents.openSession(this._agent, {
      sessionId: this.sessionId,
      transport: this._transport.kind,
      hello,
      protocol,
      remoteIp: this._remoteIp,
    });
    await this._deps.presence.setSession(this.agentId, {
      sessionId: this.sessionId,
      protocol,
      hello,
    });

    this.send("welcome", {
      protocol,
      agentId: this.agentId,
      sessionId: this.sessionId,
      serverTime: Date.now(),
      config: {
        statusIntervalMs: agentConfig.statusIntervalMs,
        metricsIntervalMs: agentConfig.metricsIntervalMs,
      },
    });

    await this._each(cap => cap.onOpen?.(this));
  }

  private async _onMessage(envelope: TAlpEnvelope): Promise<void> {
    const { type, id, seq } = envelope;
    const spec = ALP_INCOMING[type];
    const capability = this._deps.capabilities.forType(type);
    const own = type === "status" || type === "metrics";

    if (!spec || (!capability && !own)) {
      this.send(
        "error",
        {
          code: AgentError.codes.UNKNOWN_TYPE,
          message: `Неизвестный тип сообщения: ${type}`,
          retryable: false,
        },
        id,
      );

      return;
    }

    if (spec.delivery === "stream" && seq !== undefined) {
      if (seq <= this._lastSeq) {
        this._scheduleAck();

        return;
      }

      this._lastSeq = seq;
      this._seqDirty = true;
      this._scheduleAck();
    }

    const parsed = spec.schema.safeParse(envelope.data ?? {});

    if (!parsed.success) {
      this.send(
        "error",
        {
          code: AgentError.codes.MESSAGE_INVALID,
          message: parsed.error.issues.map(issue => issue.message).join("; "),
          retryable: false,
        },
        id,
      );

      return;
    }

    try {
      if (type === "status") {
        await this._onStatus(parsed.data as IAlpStatus);
      } else if (type === "metrics") {
        await this._onMetrics(parsed.data as IAlpMetrics);
      } else {
        await capability!.onMessage(this, { type, id, data: parsed.data });
      }

      if (spec.delivery === "reliable" && id) {
        this._ackIds.push(id);
        this._scheduleAck();
      }
    } catch (err) {
      const error = toAlpError(err);

      if (error.retryable) {
        logger.error(
          { err, agentId: this.agentId, type },
          "[Agent] Сообщение агента не обработано",
        );
      }
      this.send("error", error, id);
    }
  }

  private async _onStatus(status: IAlpStatus): Promise<void> {
    this._status = status;
    await this._deps.presence.setStatus(this.agentId, status);
    await this._touch();
    if (status.capacity) {
      await this._deps.agents.updateJobsCapacity(this._agent, status.capacity);
    }
    this._deps.eventBus.emit(new AgentLiveEvent(this.agentId, status));
    await this._each(cap => cap.onStatus?.(this, status));
  }

  private async _onMetrics(metrics: IAlpMetrics): Promise<void> {
    await this._deps.presence.setMetrics(this.agentId, metrics);
    this._deps.eventBus.emit(
      new AgentLiveEvent(this.agentId, undefined, metrics),
    );
  }

  /** Пульс в БД не чаще интервала; сессию вытеснили — закрыть. */
  private async _touch(): Promise<void> {
    const now = Date.now();

    if (now - this._touchedAt < AGENT_TOUCH_INTERVAL_MS) return;

    this._touchedAt = now;
    if (!(await this._deps.agents.touch(this.agentId, this.sessionId))) {
      this.close(EAgentLinkClose.Replaced, "session replaced");
    }
  }

  private _scheduleAck(): void {
    if (this._ackTimer || this._closed) return;

    this._ackTimer = setTimeout(() => {
      this._ackTimer = null;
      this._enqueue(() => this._flushAck());
    }, ACK_FLUSH_MS);
  }

  private async _flushAck(): Promise<void> {
    const ids = this._ackIds.splice(0);

    if (!ids.length && !this._lastSeq) return;

    await this._saveSeq();
    this.send("ack", {
      ...(ids.length && { ids }),
      ...(this._lastSeq > 0 && { seq: this._lastSeq }),
    });
  }

  private async _saveSeq(): Promise<void> {
    if (!this._seqDirty || !this._hello) return;

    this._seqDirty = false;
    await this._deps.presence
      .setStreamSeq(this.agentId, this._hello.agent.bootId, this._lastSeq)
      .catch(err =>
        logger.warn({ err, agentId: this.agentId }, "[Agent] seq не сохранён"),
      );
  }

  /** Версия протокола сессии. */
  get protocol(): number {
    return this._protocol;
  }
}
