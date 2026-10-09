import type {
  ConfigRecord,
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
import {
  AgentConfigStatusDto,
  IAgentConfigDto,
  IAgentConfigEntryDto,
  IAgentFetchBody,
  IAgentWorkerActionResultDto,
} from "./dto";

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

const toConfigDto = (record: ConfigRecord): IAgentConfigDto => ({
  agentId: record.agentId,
  worker: record.worker,
  key: record.key,
  version: record.version,
  data: record.data,
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

/**
 * Воркеры агента: перезапуск и обновление из выпуска (занятый воркер — ответ
 * сразу, замена после окончания работы, итог — событие `action`; `force` —
 * сразу), настройки по ключам (проверка по схеме из манифеста воркера —
 * `validateConfigs`), запрос к воркеру с потоком ответа (в аудит — только
 * изменяющие методы). Действия и запросы выполняет копия с соединением
 * агента: из другой копии SDK пересылает их туда (`relay`), без пересылки —
 * `AGENT_ELSEWHERE` (503, повторить).
 */
@Injectable()
export class AgentWorkerService {
  constructor(
    @inject(AgentRuntime) private readonly _runtime: AgentRuntime,
    @inject(AgentAccessService) private readonly _access: AgentAccessService,
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
        this._runtime.agents
          .by(actor.userId)
          .restartWorker(id, worker, { force }),
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
        this._runtime.agents
          .by(actor.userId)
          .updateWorker(id, worker, { force }),
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

    const agents = this._runtime.agents;
    const [records, statuses] = await callAgents(() =>
      Promise.all([agents.listConfigs(id), agents.configStatus(id, worker)]),
    );
    const byKey = new Map(
      records.map(record => [entryKey(record.worker, record.key), record]),
    );

    return statuses.map(status => {
      const record = byKey.get(entryKey(status.worker, status.key));

      return {
        worker: status.worker,
        key: status.key,
        ...(record && { config: toConfigDto(record) }),
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

    return this.entry(id, worker, key);
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
    await callAgents(() =>
      this._runtime.agents.by(actor.userId).setConfig(id, worker, key, data),
    );

    return this.entry(id, worker, key);
  }

  async deleteConfig(
    actor: IAgentActor,
    id: string,
    worker: string,
    key: string,
  ): Promise<void> {
    await this._access.require(actor, id, "config");

    const deleted = await callAgents(() =>
      this._runtime.agents.by(actor.userId).deleteConfig(id, worker, key),
    );

    if (!deleted) throw AgentError.CONFIG_NOT_FOUND();
  }

  /**
   * Запрос к воркеру через агента: ответ — статус, заголовки и поток тела
   * воркера. Ответ воркера с ошибкой (4xx, 5xx) — обычный ответ; ошибка до
   * ответа воркера — `AgentError` или код агента (`WORKER_UNAVAILABLE`, …).
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
    const agents = AGENT_AUDITED_FETCH_METHODS.includes(method)
      ? this._runtime.agents.by(actor.userId)
      : this._runtime.agents;
    const response = await callAgents(() =>
      agents.fetch(id, worker, body.path, {
        method,
        headers: body.headers ?? {},
        ...(payload !== undefined && { body: payload }),
        timeoutMs: body.timeoutMs ?? AGENT_FETCH_TIMEOUT.defaultMs,
        signal,
      }),
    );
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
    const record = await this._runtime.agents.getConfig(id, worker, key);

    return record ? toConfigDto(record) : null;
  }

  /** Записать значение от имени системы. */
  async putConfig(
    id: string,
    worker: string,
    key: string,
    data: unknown,
  ): Promise<IAgentConfigDto> {
    return toConfigDto(
      await callAgents(() =>
        this._runtime.agents.setConfig(id, worker, key, data),
      ),
    );
  }

  private async entry(
    id: string,
    worker: string,
    key: string,
  ): Promise<IAgentConfigEntryDto> {
    const agents = this._runtime.agents;
    const [record, statuses] = await callAgents(() =>
      Promise.all([
        agents.getConfig(id, worker, key),
        agents.configStatus(id, worker),
      ]),
    );
    const status = statuses.find(s => s.key === key);

    if (!status) throw AgentError.CONFIG_NOT_FOUND();

    return {
      worker,
      key,
      ...(record && { config: toConfigDto(record) }),
      status: AgentConfigStatusDto.fromModel(status),
    };
  }
}
