import type { AgentEvent, MetricsEvent } from "agent-sdk/server";
import { inject } from "inversify";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";

import type { ICursorPageDto } from "../../core";
import { decodeCursor, encodeCursor, Injectable } from "../../core";
import { agentConfig } from "./agent.config";
import { AgentMetric } from "./agent-metric.entity";
import { AgentMetricRepository } from "./agent-metric.repository";
import { AgentWorkerEvent } from "./agent-worker-event.entity";
import {
  AgentWorkerEventRepository,
  IAgentEventFilter,
} from "./agent-worker-event.repository";
import { IAgentEventDto, IAgentMetricsPointDto } from "./dto";
import { jsonSafe } from "./store/agent.store";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Курсор ленты событий: последняя запись прошлой страницы. */
interface IEventCursor extends Record<string, unknown> {
  receivedAt: number;
  id: string;
}

const isEventCursor = (value: unknown): value is IEventCursor =>
  !!value &&
  typeof (value as IEventCursor).receivedAt === "number" &&
  typeof (value as IEventCursor).id === "string";

export const toAgentEventDto = (
  event: AgentEvent | AgentWorkerEvent,
): IAgentEventDto => ({
  id: event.id,
  agentId: event.agentId,
  worker: event.worker,
  type: event.type,
  ...(event.data !== undefined && event.data !== null && { data: event.data }),
  at: event.at,
  receivedAt: event.receivedAt,
});

const toPointDto = (row: AgentMetric): IAgentMetricsPointDto => ({
  at: row.at,
  ...(row.host && { host: row.host }),
  ...(row.workers && { workers: row.workers }),
});

/** Параметры ленты событий (область агентов решена вызывающим). */
export interface IAgentEventFeedQuery {
  agentIds?: string[];
  worker?: string;
  type?: string;
  cursor?: string;
  limit: number;
}

export interface IAgentMetricsQuery {
  agentId: string;
  since?: number;
  until?: number;
  limit: number;
}

/**
 * История агентов, которую SDK не хранит: события воркеров (с отсечкой
 * повторной доставки по id сообщения агента) и точки метрик (не чаще
 * `metricsStoreIntervalMs` на агента), уборка по сроку.
 */
@Injectable()
export class AgentHistoryService {
  /** Время последней сохранённой точки агента в этом процессе, мс. */
  private readonly _lastStored = new Map<string, number>();

  constructor(
    @inject(AgentWorkerEventRepository)
    private readonly _events: AgentWorkerEventRepository,
    @inject(AgentMetricRepository)
    private readonly _metrics: AgentMetricRepository,
  ) {}

  /** Сохранить событие; `false` — оно уже было (повтор доставки). */
  saveEvent(event: AgentEvent): Promise<boolean> {
    return this._events.insertIfNew(
      this._events.create({
        agentId: event.agentId,
        id: event.id,
        worker: event.worker,
        type: event.type,
        data: event.data === undefined ? null : jsonSafe(event.data),
        at: event.at,
        receivedAt: event.receivedAt,
      }),
    );
  }

  /**
   * Точка метрик — в историю, если с прошлой сохранённой прошло не меньше
   * интервала. Досылка после разрыва (точка старше последней) тоже
   * сохраняется: время задаёт узел.
   */
  async saveMetrics(point: MetricsEvent): Promise<boolean> {
    const every = agentConfig.metricsStoreIntervalMs;
    const last = this._lastStored.get(point.agentId);

    if (last !== undefined && point.at >= last && point.at - last < every) {
      return false;
    }

    // jsonb-поля типизированы `unknown`-записями — TypeORM их не выводит.
    await this._metrics.insert({
      agentId: point.agentId,
      at: point.at,
      host: point.host ? jsonSafe(point.host) : null,
      workers: point.workers ? jsonSafe(point.workers) : null,
    } as QueryDeepPartialEntity<AgentMetric>);
    if (last === undefined || point.at > last) {
      this._lastStored.set(point.agentId, point.at);
    }

    return true;
  }

  async eventFeed(
    query: IAgentEventFeedQuery,
  ): Promise<ICursorPageDto<IAgentEventDto>> {
    const decoded = decodeCursor<IEventCursor>(query.cursor);
    const filter: IAgentEventFilter = {
      agentIds: query.agentIds,
      worker: query.worker,
      type: query.type,
      before: isEventCursor(decoded) ? decoded : undefined,
      limit: query.limit,
    };
    const rows = await this._events.findFeed(filter);
    const last = rows[rows.length - 1];

    return {
      items: rows.map(toAgentEventDto),
      nextCursor:
        rows.length === query.limit && last
          ? encodeCursor({ receivedAt: last.receivedAt, id: last.id })
          : null,
    };
  }

  async metrics(query: IAgentMetricsQuery): Promise<IAgentMetricsPointDto[]> {
    return (await this._metrics.findRange(query)).map(toPointDto);
  }

  /** Агент удалён — его история тоже. */
  async forget(agentId: string): Promise<void> {
    this._lastStored.delete(agentId);
    await Promise.all([
      this._events.deleteByAgent(agentId),
      this._metrics.deleteByAgent(agentId),
    ]);
  }

  /** Уборка по сроку хранения. */
  async prune(now = Date.now()): Promise<{ events: number; metrics: number }> {
    const [events, metrics] = await Promise.all([
      this._events.deleteReceivedBefore(
        now - agentConfig.eventsRetentionDays * DAY_MS,
      ),
      this._metrics.deleteBefore(
        now - agentConfig.metricsRetentionHours * HOUR_MS,
      ),
    ]);

    return { events, metrics };
  }
}
