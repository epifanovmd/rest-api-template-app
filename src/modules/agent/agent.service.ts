import {
  type Agent,
  AgentsError,
  type LogEntry,
  type ReleaseView,
} from "agent-sdk/server";
import { inject } from "inversify";

import { config } from "../../config";
import {
  ICursorPageDto,
  Injectable,
  IPaginatedDto,
  normalizePagination,
  toPage,
} from "../../core";
import { agentConfig } from "./agent.config";
import { AgentError, callAgents, toAgentError } from "./agent.errors";
import { AgentRuntime } from "./agent.runtime";
import {
  AgentAccessService,
  IAgentActor,
  inScope,
} from "./agent-access.service";
import { bundleInstallFlags, bundleInstallUrl } from "./agent-bundle";
import {
  AgentHistoryService,
  IAgentEventFeedQuery,
} from "./agent-history.service";
import { updateCandidates } from "./agent-update";
import {
  AgentAlertDto,
  AgentConfigStatusDto,
  AgentDto,
  IAgentEventDto,
  IAgentInstallCommandDto,
  IAgentLogsDto,
  IAgentMetricsPointDto,
  IAgentReleaseDto,
  IAgentReleaseManifestDto,
  IAgentUpdateResultDto,
  ICreateAgentInstallCommandBody,
} from "./dto";

/** Сколько точек метрик по умолчанию. */
const METRICS_DEFAULT_LIMIT = 500;
/** Сколько событий на странице по умолчанию. */
const EVENTS_DEFAULT_LIMIT = 50;

/** Фильтр ленты событий. */
export interface IAgentEventsQuery {
  agentId?: string;
  worker?: string;
  type?: string;
  cursor?: string;
  limit?: number;
}

/** Окно истории метрик. */
export interface IAgentMetricsRangeQuery {
  since?: number;
  until?: number;
  limit?: number;
}

/** Параметры журнала. */
export interface IAgentLogsQuery {
  worker?: string;
  lines?: number;
}

/** Заданные поля объекта (аргументы действия в аудите). */
const definedOf = (value: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));

/** Значение в одинарных кавычках POSIX sh. */
const shQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

/** Сборки каталога воркеров проекта для API: у каждой — источник `local`. */
const toManifestDto = (release: ReleaseView): IAgentReleaseManifestDto => ({
  version: release.version,
  ...(release.publicKey && { publicKey: release.publicKey }),
  artifacts: release.artifacts.map(a => ({ ...a, source: "local" })),
  ...(release.workers && {
    workers: release.workers.map(w => ({ ...w, source: "local" })),
  }),
});

/**
 * Агенты: список и карточка (`hello`, `status` с воркерами, последняя точка
 * метрик, проблемы), отзыв, удаление, смена ключа, обновление, журнал,
 * сборки воркеров проекта и команда установки. Доступ — право модуля или
 * политика (`AgentAccessService`); изменяющие вызовы — в аудит от имени
 * пользователя (`AgentRuntime.audit`, `AgentRuntime.action`).
 */
@Injectable()
export class AgentService {
  constructor(
    @inject(AgentRuntime) private readonly _runtime: AgentRuntime,
    @inject(AgentAccessService) private readonly _access: AgentAccessService,
    @inject(AgentHistoryService) private readonly _history: AgentHistoryService,
  ) {}

  /** Агенты в порядке регистрации: все или доступные через политики. */
  async list(
    actor: IAgentActor,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<AgentDto>> {
    const scope = await this._access.scope(actor, "view");
    const page = normalizePagination(offset, limit);
    const agents = (await this._runtime.agents.listAgents()).filter(agent =>
      inScope(scope, agent.id),
    );

    return toPage(
      await this.toDtos(agents.slice(page.offset, page.offset + page.limit)),
      agents.length,
      page,
    );
  }

  async get(actor: IAgentActor, id: string): Promise<AgentDto> {
    await this._access.require(actor, id, "view");

    return this._runtime.toDto(await this.require(id));
  }

  /** Текущие проблемы: одного агента или всех в области просмотра. */
  async alerts(actor: IAgentActor, agentId?: string): Promise<AgentAlertDto[]> {
    if (agentId) await this._access.require(actor, agentId, "view");

    const scope = agentId ? "all" : await this._access.scope(actor, "view");
    const agents = agentId
      ? [await this.require(agentId)]
      : (await this._runtime.agents.listAgents()).filter(agent =>
          inScope(scope, agent.id),
        );
    const alerts = await Promise.all(
      agents.map(agent => this._runtime.alertsOf(agent)),
    );

    return alerts.flat().map(AgentAlertDto.fromModel);
  }

  /** Лента событий воркеров, новые первыми: одного агента или всех в области. */
  async events(
    actor: IAgentActor,
    query: IAgentEventsQuery,
  ): Promise<ICursorPageDto<IAgentEventDto>> {
    if (query.agentId) await this._access.require(actor, query.agentId, "view");

    const scope = query.agentId
      ? new Set([query.agentId])
      : await this._access.scope(actor, "view");
    const feed: IAgentEventFeedQuery = {
      agentIds: scope === "all" ? undefined : [...scope],
      worker: query.worker,
      type: query.type,
      cursor: query.cursor,
      limit: query.limit ?? EVENTS_DEFAULT_LIMIT,
    };

    return this._history.eventFeed(feed);
  }

  /** История метрик агента по возрастанию времени: последние `limit` точек окна. */
  async metrics(
    actor: IAgentActor,
    id: string,
    query: IAgentMetricsRangeQuery,
  ): Promise<IAgentMetricsPointDto[]> {
    await this._access.require(actor, id, "view");

    return this._history.metrics({
      agentId: id,
      since: query.since,
      until: query.until,
      limit: query.limit ?? METRICS_DEFAULT_LIMIT,
    });
  }

  /**
   * Отозвать: ключ больше не принимается, соединение закрывается. Только с
   * правом модуля `agent:manage`: доступ через политику (свой узел) отзыв не
   * открывает — агента узла убирает удаление агента с узла.
   */
  async revoke(actor: IAgentActor, id: string): Promise<AgentDto> {
    await this.requireModuleManage(actor, id);

    const agent = await callAgents(() => this._runtime.agents.revoke(id));

    this._runtime.audit(actor.userId, "agent.revoke", id);

    return this._runtime.toDto(agent);
  }

  /** Удалить запись агента, его настройки и историю (только `agent:manage`). */
  async delete(actor: IAgentActor, id: string): Promise<void> {
    await this.requireModuleManage(actor, id);
    await callAgents(() => this._runtime.agents.deleteAgent(id));
    this._runtime.audit(actor.userId, "agent.delete", id);
  }

  /** Сменить ключ: агент переподключится с новым секретом. */
  async rotateKey(actor: IAgentActor, id: string): Promise<void> {
    await this._access.require(actor, id, "manage");
    await callAgents(() =>
      this._runtime.action(actor.userId, id, "agent.rotateKey", undefined, () =>
        this._runtime.agents.rotateKey(id),
      ),
    );
  }

  /**
   * Обновить агента до новой версии, которую он нашёл в своём каталоге сборок
   * (`update.latest`); итог — после запуска новой версии. Новой версии нет —
   * `UPDATE_NOT_AVAILABLE`, агент себя не обновляет — `UPDATE_NOT_SUPPORTED`.
   */
  async update(actor: IAgentActor, id: string): Promise<IAgentUpdateResultDto> {
    await this._access.require(actor, id, "manage");
    const agent = await this.require(id);
    const candidate = updateCandidates([agent], null).agents[0];

    if (!candidate) {
      throw (agent.hello?.agent.updateMode ?? "self") === "self"
        ? AgentError.UPDATE_NOT_AVAILABLE()
        : AgentError.UPDATE_NOT_SUPPORTED();
    }

    const args = { version: candidate.target };

    return callAgents(() =>
      this._runtime.action(actor.userId, id, "agent.update", args, () =>
        this._runtime.agents.updateAgent(id, args),
      ),
    );
  }

  /** Последние строки журнала агента или воркера (с узла). */
  async logs(
    actor: IAgentActor,
    id: string,
    query: IAgentLogsQuery,
  ): Promise<IAgentLogsDto> {
    await this._access.require(actor, id, "logs");

    const entries: LogEntry[] = await callAgents(() =>
      this._runtime.action(
        actor.userId,
        id,
        "agent.logs",
        definedOf(query),
        () => this._runtime.agents.logs(id, query),
      ),
    );

    return { entries };
  }

  /**
   * Сборки воркеров проекта (`release/` каталога архивов `AGENT_BUNDLE_DIR`)
   * и кого можно обновить: агентов — до версии, которую они нашли сами,
   * воркеры — до сборки с сервера.
   */
  async release(actor: IAgentActor): Promise<IAgentReleaseDto> {
    const scope = await this._access.scope(actor, "view");
    const agents = this._runtime.agents;
    const [manifest, list] = await Promise.all([
      agents.release(),
      agents.listAgents(),
    ]);
    const candidates = updateCandidates(list, manifest);

    return {
      manifest: manifest && toManifestDto(manifest),
      candidates: candidates.agents.filter(c => inScope(scope, c.agentId)),
      workerCandidates: candidates.workers.filter(c =>
        inScope(scope, c.agentId),
      ),
    };
  }

  /**
   * Команда установки агента одной строкой: установщик агента с этого сервера
   * ставит архив папки агента (`agent pack`) под машину узла —
   * `install.sh --bundle … --token …`.
   */
  installCommand(
    body: ICreateAgentInstallCommandBody,
  ): IAgentInstallCommandDto {
    const server = body.baseUrl ?? this.publicUrl();
    const sudo = body.mode === "rootless" || body.mode === "run" ? "" : "sudo ";
    const flags = [
      ...bundleInstallFlags(server),
      ...(body.mode === "rootless" ? ["--rootless"] : []),
      ...(body.mode === "run" ? ["--run"] : []),
      ...(body.tokenFile
        ? ["--token-file", body.tokenFile]
        : ["--token", body.token ?? ""]),
    ];

    return {
      command: `curl -fsSL ${shQuote(bundleInstallUrl(server))} | ${sudo}sh -s -- ${flags.map(shQuote).join(" ")}`,
    };
  }

  /** Адрес сервера для агентов: `AGENT_PUBLIC_URL` или `APP_PUBLIC_URL`. */
  publicUrl(): string {
    return (agentConfig.publicUrl ?? config.app.publicUrl).replace(/\/+$/, "");
  }

  // ─── для других модулей (без проверки прав) ──────────────────────────

  async find(id: string): Promise<AgentDto | null> {
    const agent = await this._runtime.agents.getAgent(id);

    return agent ? this._runtime.toDto(agent) : null;
  }

  async all(): Promise<AgentDto[]> {
    return this.toDtos(await this._runtime.agents.listAgents());
  }

  /** Статус настроек агента (желаемая, доставленная, применённая версии). */
  async configStatus(id: string): Promise<AgentConfigStatusDto[]> {
    return (await this._runtime.agents.configStatus(id)).map(
      AgentConfigStatusDto.fromModel,
    );
  }

  /** Агенты, которых можно обновить до новой версии. */
  async updateCandidateIds(): Promise<Set<string>> {
    const { agents } = updateCandidates(
      await this._runtime.agents.listAgents(),
      null,
    );

    return new Set(agents.map(c => c.agentId));
  }

  /** Отозвать от имени пользователя (`actorId`) или системы (пусто). */
  async revokeAs(actorId: string, id: string): Promise<void> {
    await callAgents(() => this._runtime.agents.revoke(id));
    this._runtime.audit(actorId, "agent.revoke", id);
  }

  /** Отозвать и удалить запись (агент удалён с машины). */
  async revokeAndDelete(actorId: string, id: string): Promise<void> {
    const agents = this._runtime.agents;

    try {
      await agents.revoke(id);
      this._runtime.audit(actorId, "agent.revoke", id);
      await agents.deleteAgent(id);
      this._runtime.audit(actorId, "agent.delete", id);
    } catch (err) {
      if (err instanceof AgentsError && err.code === "AGENT_NOT_FOUND") return;
      throw toAgentError(err);
    }
  }

  /** Видимый агент без права модуля на управление — 403, невидимый — 404. */
  private async requireModuleManage(
    actor: IAgentActor,
    id: string,
  ): Promise<void> {
    await this._access.require(actor, id, "view");
    if (!this._access.hasAll(actor, "manage")) throw AgentError.FORBIDDEN();
  }

  private toDtos(agents: Agent[]): Promise<AgentDto[]> {
    return Promise.all(agents.map(agent => this._runtime.toDto(agent)));
  }

  private async require(id: string): Promise<Agent> {
    const agent = await this._runtime.agents.getAgent(id);

    if (!agent) throw AgentError.NOT_FOUND();

    return agent;
  }
}
