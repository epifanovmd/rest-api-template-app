import type {
  Agent,
  RestartResult,
  WorkerUpdateResult,
} from "agent-sdk/server";
import { inject } from "inversify";

import { Injectable } from "../../core";
import { AgentError, callAgents } from "./agent.errors";
import { AgentRuntime } from "./agent.runtime";
import {
  AGENT_AUDITED_FETCH_METHODS,
  AGENT_FETCH_BODY_MAX,
  AGENT_FETCH_TIMEOUT,
} from "./agent.types";
import { AgentAccessService, IAgentActor } from "./agent-access.service";
import { requireValidConfig, requireValidRequest } from "./agent-schema";
import {
  AgentConfigStatusDto,
  IAgentConfigDto,
  IAgentConfigEntryDto,
  IAgentFetchBody,
  IAgentWorkerActionResultDto,
} from "./dto";
import { AgentStore, IAgentConfigRecord } from "./store/agent.store";

/** Заголовки ответа воркера, которые не передаются клиенту как есть. */
const HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

/** Ответ воркера для передачи клиенту потоком. */
export interface IAgentFetchResult {
  status: number;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
}

/**
 * Значение ключа для ответа. Само значение (`data`) — только с правом на
 * настройки: в нём бывают секреты воркера.
 */
const toConfigDto = (
  record: IAgentConfigRecord,
  withData: boolean,
): IAgentConfigDto => ({
  agentId: record.agentId,
  worker: record.worker,
  key: record.key,
  version: record.version,
  ...(withData && { data: record.data }),
  updatedAt: record.updatedAt,
  ...(record.actor && { actor: record.actor }),
});

const entryKey = (worker: string, key: string): string => `${worker}/${key}`;

/** Итог замены воркера: сразу или отложена до окончания работы. */
const toActionResult = (
  result: RestartResult | WorkerUpdateResult,
): IAgentWorkerActionResultDto =>
  result.deferred
    ? {
        deferred: true,
        pending: result.pending,
        actionId: result.actionId,
      }
    : {
        deferred: false,
        ...("version" in result && { version: result.version }),
        ...("previous" in result &&
          result.previous !== undefined && { previous: result.previous }),
      };

/** Тело запроса к воркеру: текст или байты из base64. */
const requestBody = (
  body: IAgentFetchBody,
): string | Uint8Array | undefined => {
  if (body.body === undefined) return undefined;
  if (body.encoding !== "base64") return body.body;

  const bytes = Buffer.from(body.body, "base64");

  if (bytes.length > AGENT_FETCH_BODY_MAX) throw AgentError.TOO_LARGE();

  return new Uint8Array(bytes);
};

/** Аргументы замены воркера: имя и `force`, если задан. */
const workerArgs = (
  worker: string,
  force: boolean,
): Record<string, unknown> => ({ name: worker, ...(force && { force: true }) });

/**
 * Воркеры агента: перезапуск и обновление с сервера (занятый воркер — ответ
 * сразу, замена после окончания работы, итог — событие `action`; `force` —
 * сразу), настройки по ключам (значение — по схеме ключа из манифеста
 * воркера, `CONFIG_INVALID`), запрос к воркеру с потоком ответа (тело — по
 * схеме маршрута, `REQUEST_INVALID`; в аудит — только изменяющие методы).
 * Действия и запросы выполняет копия с соединением агента; в другой копии —
 * `AGENT_ELSEWHERE` (503, повторить).
 */
@Injectable()
export class AgentWorkerService {
  constructor(
    @inject(AgentRuntime) private readonly _runtime: AgentRuntime,
    @inject(AgentAccessService) private readonly _access: AgentAccessService,
    @inject(AgentStore) private readonly _store: AgentStore,
  ) {}

  async restart(
    actor: IAgentActor,
    id: string,
    worker: string,
    force: boolean,
  ): Promise<IAgentWorkerActionResultDto> {
    await this._access.require(actor, id, "manage");

    return toActionResult(
      await callAgents(() =>
        this._runtime.action(
          actor.userId,
          id,
          "worker.restart",
          workerArgs(worker, force),
          () => this._runtime.agents.restartWorker(id, worker, { force }),
        ),
      ),
    );
  }

  async update(
    actor: IAgentActor,
    id: string,
    worker: string,
    force: boolean,
  ): Promise<IAgentWorkerActionResultDto> {
    await this._access.require(actor, id, "manage");

    return toActionResult(
      await callAgents(() =>
        this._runtime.action(
          actor.userId,
          id,
          "worker.update",
          workerArgs(worker, force),
          () => this._runtime.agents.updateWorker(id, worker, { force }),
        ),
      ),
    );
  }

  /** Ключи настроек агента: значение и статус применения. */
  async listConfigs(
    actor: IAgentActor,
    id: string,
    worker?: string,
  ): Promise<IAgentConfigEntryDto[]> {
    await this._access.require(actor, id, "view");

    const withData = await this._access.can(actor, id, "config");

    const [records, statuses] = await callAgents(() =>
      Promise.all([
        this._store.listConfigs(id),
        this._runtime.agents.configStatus(id, worker),
      ]),
    );
    const byKey = new Map(
      records.map(record => [entryKey(record.worker, record.key), record]),
    );

    return statuses.map(status => {
      const record = byKey.get(entryKey(status.worker, status.key));

      return {
        worker: status.worker,
        key: status.key,
        ...(record && { config: toConfigDto(record, withData) }),
        status: AgentConfigStatusDto.fromModel(status),
      };
    });
  }

  async getConfig(
    actor: IAgentActor,
    id: string,
    worker: string,
    key: string,
  ): Promise<IAgentConfigEntryDto> {
    await this._access.require(actor, id, "view");

    return this.entry(
      id,
      worker,
      key,
      await this._access.can(actor, id, "config"),
    );
  }

  /** Записать значение (новая версия); агент получит его сразу или при подключении. */
  async setConfig(
    actor: IAgentActor,
    id: string,
    worker: string,
    key: string,
    data: unknown,
  ): Promise<IAgentConfigEntryDto> {
    await this._access.require(actor, id, "config");
    await this.writeConfig(actor.userId, id, worker, key, data);

    return this.entry(id, worker, key, true);
  }

  async deleteConfig(
    actor: IAgentActor,
    id: string,
    worker: string,
    key: string,
  ): Promise<void> {
    await this._access.require(actor, id, "config");

    const deleted = await callAgents(() =>
      this._runtime.agents.deleteConfig(id, worker, key),
    );

    if (!deleted) throw AgentError.CONFIG_NOT_FOUND();
    this._runtime.audit(actor.userId, "config.delete", id, { worker, key });
  }

  /**
   * Запрос к воркеру через агента: ответ — статус, заголовки и поток тела
   * воркера. Ответ воркера с ошибкой (4xx, 5xx) — обычный ответ; ошибка до
   * ответа воркера — `AgentError` или код агента (`WORKER_UNAVAILABLE`, …).
   * Тело — по схеме маршрута из манифеста воркера (`REQUEST_INVALID`).
   * Изменяющий запрос (`POST`, `PUT`, `PATCH`, `DELETE`) — от имени
   * пользователя, в аудит; чтение — без аудита.
   */
  async fetch(
    actor: IAgentActor,
    id: string,
    worker: string,
    body: IAgentFetchBody,
    signal: AbortSignal,
  ): Promise<IAgentFetchResult> {
    await this._access.require(actor, id, "fetch");

    const payload = requestBody(body);
    const method = (body.method ?? "GET").toUpperCase();
    const response = await callAgents(async () => {
      requireValidRequest(
        await this.requireAgent(id),
        worker,
        method,
        body.path,
        payload,
      );

      const res = await this._runtime.agents.fetch(id, worker, body.path, {
        method,
        headers: body.headers ?? {},
        ...(payload !== undefined && { body: payload }),
        timeoutMs: body.timeoutMs ?? AGENT_FETCH_TIMEOUT.defaultMs,
        signal,
      });

      if (AGENT_AUDITED_FETCH_METHODS.includes(method)) {
        this._runtime.audit(actor.userId, "fetch", id, {
          worker,
          method,
          path: body.path,
        });
      }

      return res;
    });
    const headers: Record<string, string> = {};

    for (const [name, value] of response.headers) {
      if (!HOP_HEADERS.has(name)) headers[name] = value;
    }

    return { status: response.status, headers, body: response.body };
  }

  // ─── для других модулей (без проверки прав) ──────────────────────────

  /** Значение ключа или `null`. */
  async findConfig(
    id: string,
    worker: string,
    key: string,
  ): Promise<IAgentConfigDto | null> {
    const record = await this.findRecord(id, worker, key);

    return record ? toConfigDto(record, true) : null;
  }

  /** Записать значение от имени системы. */
  async putConfig(
    id: string,
    worker: string,
    key: string,
    data: unknown,
  ): Promise<IAgentConfigDto> {
    return toConfigDto(await this.writeConfig("", id, worker, key, data), true);
  }

  /**
   * Новая версия значения: по схеме ключа из манифеста воркера
   * (`CONFIG_INVALID`), от имени пользователя (`actorId`; пусто — система),
   * в аудит.
   */
  private async writeConfig(
    actorId: string,
    id: string,
    worker: string,
    key: string,
    data: unknown,
  ): Promise<IAgentConfigRecord> {
    const record = await callAgents(async () => {
      requireValidConfig(await this.requireAgent(id), worker, key, data);

      return this._store.withActor(actorId, () =>
        this._runtime.agents.setConfig(id, worker, key, data),
      );
    });

    this._runtime.audit(actorId, "config.set", id, {
      worker,
      key,
      version: record.version,
    });

    return { ...record, ...(actorId && { actor: actorId }) };
  }

  private async findRecord(
    id: string,
    worker: string,
    key: string,
  ): Promise<IAgentConfigRecord | undefined> {
    return (await this._store.listConfigs(id)).find(
      record => record.worker === worker && record.key === key,
    );
  }

  /** Запись агента; нет — `AGENT_NOT_FOUND`. */
  private async requireAgent(id: string): Promise<Agent> {
    const agent = await this._runtime.agents.getAgent(id);

    if (!agent) throw AgentError.NOT_FOUND();

    return agent;
  }

  private async entry(
    id: string,
    worker: string,
    key: string,
    withData: boolean,
  ): Promise<IAgentConfigEntryDto> {
    const [record, statuses] = await callAgents(() =>
      Promise.all([
        this.findRecord(id, worker, key),
        this._runtime.agents.configStatus(id, worker),
      ]),
    );
    const status = statuses.find(s => s.key === key);

    if (!status) throw AgentError.CONFIG_NOT_FOUND();

    return {
      worker,
      key,
      ...(record && { config: toConfigDto(record, withData) }),
      status: AgentConfigStatusDto.fromModel(status),
    };
  }
}
