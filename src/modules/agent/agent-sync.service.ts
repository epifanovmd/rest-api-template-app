import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import type { Agent } from "./agent.entity";
import { AgentError } from "./agent.errors";
import { AgentService } from "./agent.service";
import { AGENT_SYNC_MAX_WAIT_SECONDS, EAgentTransport } from "./agent.types";
import { AgentCapabilityRegistry } from "./agent-capability.registry";
import { EAgentLinkClose, TAlpEnvelope } from "./agent-link.protocol";
import { AgentPresenceStore } from "./agent-presence.store";
import { AgentSession, IAgentTransport } from "./agent-session";
import { AgentSessionHub } from "./agent-session.hub";
import type { IAgentSyncBody, IAgentSyncDto, IAlpEnvelopeDto } from "./dto";

/** Без обмена дольше — HTTP-сессия забывается процессом (агент её восстановит). */
const SYNC_IDLE_MS = 90_000;

/**
 * Транспорт HTTP sync: исходящее копится до ответа на запрос агента;
 * ожидающий запрос просыпается на первом исходящем сообщении.
 */
class SyncTransport implements IAgentTransport {
  readonly kind = EAgentTransport.HTTP;
  closeCode: number | null = null;

  private _outbox: string[] = [];
  private _wake: (() => void) | null = null;

  send(raw: string): void {
    this._outbox.push(raw);
    this._wake?.();
  }

  close(code: number): void {
    this.closeCode = code;
    this._wake?.();
  }

  get hasOutgoing(): boolean {
    return this._outbox.length > 0;
  }

  /** Ждать исходящего или закрытия до `ms`; прерывается отключением клиента. */
  wait(ms: number, abort?: AbortSignal): Promise<void> {
    if (this.hasOutgoing || this.closeCode !== null || abort?.aborted) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        abort?.removeEventListener("abort", finish);
        this._wake = null;
        resolve();
      };
      const timer = setTimeout(finish, ms);

      this._wake = finish;
      abort?.addEventListener("abort", finish, { once: true });
    });
  }

  take(): IAlpEnvelopeDto[] {
    const messages = this._outbox.map(raw => JSON.parse(raw) as TAlpEnvelope);

    this._outbox = [];

    return messages;
  }
}

/** HTTP sync-сессия процесса: сессия, её транспорт и таймер простоя. */
interface ISyncEntry {
  session: AgentSession;
  transport: SyncTransport;
  idle: NodeJS.Timeout;
}

/**
 * Запасной транспорт канала агентов: пачки конвертов через HTTP с long-poll
 * (§2.2 протокола). Логика сессии — та же `AgentSession`. Запрос может
 * попасть в любой процесс API: сессия восстанавливается по снимку в Redis,
 * текущая сессия агента сверяется с БД.
 */
@Injectable()
export class AgentSyncService {
  private readonly _entries = new Map<string, ISyncEntry>();

  constructor(
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(AgentPresenceStore) private readonly _presence: AgentPresenceStore,
    @inject(AgentCapabilityRegistry)
    private readonly _capabilities: AgentCapabilityRegistry,
    @inject(AgentSessionHub) private readonly _hub: AgentSessionHub,
    @inject(EventBus) private readonly _eventBus: EventBus,
  ) {}

  async exchange(
    agent: Agent,
    body: IAgentSyncBody,
    remoteIp: string | undefined,
    abort?: AbortSignal,
  ): Promise<IAgentSyncDto> {
    const messages = [...body.messages];
    const entry = body.sessionId
      ? await this._existing(agent, body.sessionId)
      : this._open(agent, remoteIp, messages.shift());

    this._touch(entry);
    for (const message of messages) {
      entry.session.receive(JSON.stringify(message));
    }
    await entry.session.settle();
    this._throwIfClosed(entry);

    const wait =
      Math.min(body.waitSeconds ?? 0, AGENT_SYNC_MAX_WAIT_SECONDS) * 1000;

    if (!entry.transport.hasOutgoing && wait > 0) {
      await entry.transport.wait(wait, abort);
      this._throwIfClosed(entry);
    }

    return {
      sessionId: entry.session.sessionId,
      messages: entry.transport.take(),
    };
  }

  /** Новая сессия: первое сообщение — `hello`. */
  private _open(
    agent: Agent,
    remoteIp: string | undefined,
    hello: IAlpEnvelopeDto | undefined,
  ): ISyncEntry {
    if (hello?.type !== "hello") throw AgentError.HELLO_REQUIRED();

    const entry = this._create(agent, remoteIp);

    entry.session.receive(JSON.stringify(hello));

    return entry;
  }

  /** Сессия этого процесса или восстановленная по снимку. */
  private async _existing(
    agent: Agent,
    sessionId: string,
  ): Promise<ISyncEntry> {
    const local = this._entries.get(sessionId);

    if (local && !local.session.closed) return local;
    if (agent.sessionId !== sessionId) {
      throw agent.sessionId
        ? AgentError.SESSION_REPLACED()
        : AgentError.SESSION_EXPIRED();
    }

    const snapshot = await this._presence.getSession(agent.id);

    if (snapshot?.sessionId !== sessionId) throw AgentError.SESSION_EXPIRED();

    const entry = this._create(agent, undefined, sessionId);

    await entry.session.resume(snapshot);

    return entry;
  }

  private _create(
    agent: Agent,
    remoteIp: string | undefined,
    sessionId?: string,
  ): ISyncEntry {
    const transport = new SyncTransport();
    const session = new AgentSession(
      agent,
      transport,
      {
        agents: this._agents,
        presence: this._presence,
        capabilities: this._capabilities,
        eventBus: this._eventBus,
      },
      remoteIp,
      sessionId,
    );
    const entry: ISyncEntry = {
      session,
      transport,
      idle: setTimeout(() => undefined, 0),
    };

    this._entries.set(session.sessionId, entry);
    this._hub.add(session);

    return entry;
  }

  /** Обмен продлевает жизнь сессии; без обмена — забыть её. */
  private _touch(entry: ISyncEntry): void {
    clearTimeout(entry.idle);
    // Агент мог перейти в другой процесс: offline определит обход по пульсу.
    entry.idle = setTimeout(() => this._forget(entry), SYNC_IDLE_MS);
    entry.idle.unref();
  }

  private _forget(entry: ISyncEntry): void {
    clearTimeout(entry.idle);
    this._entries.delete(entry.session.sessionId);
    this._hub.remove(entry.session);
    void entry.session.dispose();
  }

  /** Сессию закрыл сервер — ответ агенту кодом, по которому он поймёт что делать. */
  private _throwIfClosed(entry: ISyncEntry): void {
    const code = entry.transport.closeCode;

    if (code === null) return;

    this._forget(entry);
    switch (code) {
      case EAgentLinkClose.Unauthorized:
        throw AgentError.CREDENTIALS_INVALID();
      case EAgentLinkClose.Unsupported:
        throw AgentError.PROTOCOL_UNSUPPORTED();
      case EAgentLinkClose.Replaced:
        throw AgentError.SESSION_REPLACED();
      case EAgentLinkClose.Protocol:
        throw AgentError.MESSAGE_INVALID();
      default:
        throw AgentError.SESSION_EXPIRED();
    }
  }

  /** Остановка процесса: забыть сессии (агенты восстановят их в другом). */
  stop(): void {
    for (const entry of [...this._entries.values()]) {
      this._forget(entry);
    }
  }
}
