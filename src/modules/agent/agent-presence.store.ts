import { Injectable, LiveStore } from "../../core";
import { agentConfig } from "./agent.config";
import { AGENT_MISSED_STATUS_LIMIT } from "./agent.types";
import type { IAlpMetrics, IAlpStatus, TAlpHello } from "./agent-link.protocol";

/** Сессия агента для восстановления в другом процессе (HTTP sync без sticky). */
export interface IAgentSessionSnapshot {
  sessionId: string;
  protocol: number;
  hello: TAlpHello;
}

/** Номер потока помнится дольше любой паузы связи, после которой досылка ещё имеет смысл. */
const STREAM_SEQ_TTL_SEC = 24 * 3_600;

/** Живое состояние агента: последний `status` с отметкой времени. */
export interface IAgentLiveStatus extends IAlpStatus {
  receivedAt: number;
}

/**
 * Живое состояние агентов, общее для процессов (Redis): последний `status` и
 * `metrics`. Живёт, пока агент присылает пульс; пропал — ключи истекают.
 */
@Injectable()
export class AgentPresenceStore extends LiveStore {
  constructor() {
    super("agent:");
  }

  /** Срок жизни живого состояния — несколько пропущенных интервалов статуса. */
  get ttlSec(): number {
    return Math.ceil(
      (agentConfig.statusIntervalMs * AGENT_MISSED_STATUS_LIMIT) / 1000,
    );
  }

  setStatus(agentId: string, status: IAlpStatus): Promise<void> {
    return this.setJson(
      `status:${agentId}`,
      { ...status, receivedAt: Date.now() },
      this.ttlSec,
    );
  }

  getStatus(agentId: string): Promise<IAgentLiveStatus | null> {
    return this.getJson(`status:${agentId}`);
  }

  setMetrics(agentId: string, metrics: IAlpMetrics): Promise<void> {
    return this.setJson(
      `metrics:${agentId}`,
      metrics,
      Math.max(
        this.ttlSec,
        Math.ceil(
          (agentConfig.metricsIntervalMs * AGENT_MISSED_STATUS_LIMIT) / 1000,
        ),
      ),
    );
  }

  getMetrics(agentId: string): Promise<IAlpMetrics | null> {
    return this.getJson(`metrics:${agentId}`);
  }

  /**
   * Последний принятый номер потока агента в пределах его запуска (`bootId`):
   * после переподключения повторно досланное не обрабатывается дважды.
   */
  getStreamSeq(
    agentId: string,
  ): Promise<{ bootId: string; seq: number } | null> {
    return this.getJson(`seq:${agentId}`);
  }

  setStreamSeq(agentId: string, bootId: string, seq: number): Promise<void> {
    return this.setJson(`seq:${agentId}`, { bootId, seq }, STREAM_SEQ_TTL_SEC);
  }

  setSession(agentId: string, snapshot: IAgentSessionSnapshot): Promise<void> {
    return this.setJson(`session:${agentId}`, snapshot, STREAM_SEQ_TTL_SEC);
  }

  getSession(agentId: string): Promise<IAgentSessionSnapshot | null> {
    return this.getJson(`session:${agentId}`);
  }

  async clear(agentId: string): Promise<void> {
    await Promise.all([
      this.delete(`status:${agentId}`),
      this.delete(`metrics:${agentId}`),
    ]);
  }
}
