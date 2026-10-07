import { inject } from "inversify";

import { Injectable } from "../../core";
import type { IAgentSession } from "./agent.capability";
import { AGENT_REVOKED_SESSION } from "./agent.service";
import { AGENT_SESSION_CHANNEL, AGENT_SIGNAL_CHANNEL } from "./agent.types";
import { EAgentLinkClose } from "./agent-link.protocol";
import type { AgentSession } from "./agent-session";
import { AgentSignals } from "./agent-signals";

/**
 * Сессии агентов этого процесса. Поручения агенту рождаются в любом процессе
 * и приходят сигналами Postgres: сессию находит тот процесс, где она живёт.
 * Новая сессия агента вытесняет прежние (4410), отзыв закрывает их (4401).
 */
@Injectable()
export class AgentSessionHub {
  private readonly _sessions = new Map<string, Set<AgentSession>>();
  private readonly _off: (() => void)[] = [];

  constructor(@inject(AgentSignals) private readonly _signals: AgentSignals) {}

  /** Подписаться на сигналы; вызывает шлюз при старте. */
  listen(): void {
    if (this._off.length) return;

    this._off.push(
      this._signals.on(AGENT_SIGNAL_CHANNEL, agentId =>
        this._sessions.get(agentId)?.forEach(session => session.deliver()),
      ),
      this._signals.on(AGENT_SESSION_CHANNEL, payload =>
        this._onSessionSignal(payload),
      ),
    );
  }

  stop(): void {
    this._off.splice(0).forEach(off => off());
  }

  add(session: AgentSession): void {
    const sessions = this._sessions.get(session.agentId) ?? new Set();

    sessions.add(session);
    this._sessions.set(session.agentId, sessions);
  }

  remove(session: AgentSession): void {
    const sessions = this._sessions.get(session.agentId);

    sessions?.delete(session);
    if (sessions?.size === 0) this._sessions.delete(session.agentId);
  }

  /** Текущая сессия агента в этом процессе (после рукопожатия). */
  get(agentId: string): IAgentSession | undefined {
    for (const session of this._sessions.get(agentId) ?? []) {
      if (session.ready) return session;
    }

    return undefined;
  }

  /** Сессия агента с этим id в этом процессе (HTTP sync). */
  find(agentId: string, sessionId: string): AgentSession | undefined {
    for (const session of this._sessions.get(agentId) ?? []) {
      if (session.sessionId === sessionId && !session.closed) return session;
    }

    return undefined;
  }

  has(agentId: string): boolean {
    return this._sessions.has(agentId);
  }

  /** Агенты с сессиями в этом процессе. */
  agentIds(): string[] {
    return [...this._sessions.keys()];
  }

  each(action: (session: AgentSession) => void): void {
    this._sessions.forEach(sessions => sessions.forEach(action));
  }

  get size(): number {
    let count = 0;

    this._sessions.forEach(sessions => (count += sessions.size));

    return count;
  }

  /** Закрыть все сессии агента (отзыв, удаление). */
  closeAgent(agentId: string, code: number, reason: string): void {
    this._sessions
      .get(agentId)
      ?.forEach(session => session.close(code, reason));
  }

  private _onSessionSignal(payload: string): void {
    const [agentId, current] = payload.split(":");

    if (!agentId || !current) return;
    if (current === AGENT_REVOKED_SESSION) {
      this.closeAgent(agentId, EAgentLinkClose.Unauthorized, "agent revoked");

      return;
    }

    this._sessions.get(agentId)?.forEach(session => {
      if (session.sessionId !== current) {
        session.close(EAgentLinkClose.Replaced, "session replaced");
      }
    });
  }
}
