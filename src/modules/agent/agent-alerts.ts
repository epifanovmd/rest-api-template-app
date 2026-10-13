import type { Agent, ConfigStatus } from "agent-sdk/server";

/** Вид проблемы агента. */
export type TAgentAlertType =
  | "offline"
  | "workerDown"
  | "workerInvalid"
  | "workerUnhealthy"
  | "configFailed";

/** Проблема агента: выводится из записи агента и статусов его настроек. */
export interface IAgentAlert {
  /**
   * Ключ в пределах агента: `offline`, `workerDown:<воркер>`,
   * `workerInvalid:<воркер>`, `workerUnhealthy:<воркер>`,
   * `configFailed:<воркер>/<ключ>`.
   */
  key: string;
  agentId: string;
  agentName: string;
  type: TAgentAlertType;
  worker?: string;
  configKey?: string;
  message: string;
  /** С какого времени, мс. */
  since: number;
}

/** Проблема в событии: `active` — началась (`true`) или закончилась. */
export interface IAgentAlertChange extends IAgentAlert {
  active: boolean;
}

/**
 * Проблемы агента: без связи (с последней вести), воркер не работает
 * (`backoff`, `stopped`), не зарегистрирован (`invalid`), плохое
 * самочувствие (`health.ok: false`), настройки не применены (статус
 * `failed`). Отозванный агент проблем не имеет. `since` проблем воркеров —
 * время статуса агента (`statusAt`), если не известно раньше (`known`).
 */
export const agentAlerts = (
  agent: Agent,
  configs: readonly ConfigStatus[],
  known?: ReadonlyMap<string, number>,
  now = Date.now(),
): IAgentAlert[] => {
  if (agent.revoked) return [];

  const base = { agentId: agent.id, agentName: agent.name };
  const out: IAgentAlert[] = [];
  const since = (key: string, fallback: number | undefined): number =>
    known?.get(key) ?? fallback ?? now;

  if (!agent.online) {
    out.push({
      ...base,
      key: "offline",
      type: "offline",
      message: "агент без связи",
      since: since("offline", agent.lastSeenAt ?? agent.enrolledAt),
    });
  }
  for (const w of agent.status?.workers ?? []) {
    if (w.state === "backoff" || w.state === "stopped") {
      const key = `workerDown:${w.name}`;

      out.push({
        ...base,
        key,
        type: "workerDown",
        worker: w.name,
        message: `воркер ${w.name} не работает (${w.state}, перезапусков: ${w.restarts ?? 0})`,
        since: since(key, agent.statusAt),
      });
    } else if (w.state === "invalid") {
      const key = `workerInvalid:${w.name}`;

      out.push({
        ...base,
        key,
        type: "workerInvalid",
        worker: w.name,
        message: `воркер ${w.name} не зарегистрирован: ${w.message || "ответ GET /health или GET /manifest не подошёл"}`,
        since: since(key, agent.statusAt),
      });
    } else if (w.state === "running" && w.health?.ok === false) {
      const key = `workerUnhealthy:${w.name}`;

      out.push({
        ...base,
        key,
        type: "workerUnhealthy",
        worker: w.name,
        message: `воркер ${w.name}: ${w.health.message || "плохое самочувствие"}`,
        since: since(key, agent.statusAt),
      });
    }
  }
  for (const c of configs) {
    if (c.state !== "failed") continue;
    const key = `configFailed:${c.worker}/${c.key}`;

    out.push({
      ...base,
      key,
      type: "configFailed",
      worker: c.worker,
      configKey: c.key,
      message: `настройки ${c.worker}/${c.key} версии ${c.delivered ?? c.version} не применены: ${c.error?.message ?? c.error?.code ?? ""}`,
      since: since(key, c.updatedAt),
    });
  }

  return out;
};

/**
 * Текущие проблемы агентов этого процесса: что изменилось с прошлого раза
 * (началось, закончилось) и с какого времени идёт каждая.
 */
export class AgentAlertTracker {
  private readonly _current = new Map<string, Map<string, IAgentAlert>>();

  /** Время начала известных проблем агента: ключ → мс. */
  known(agentId: string): Map<string, number> {
    return new Map(
      [...(this._current.get(agentId)?.values() ?? [])].map(alert => [
        alert.key,
        alert.since,
      ]),
    );
  }

  /** Запомнить проблемы агента; итог — начавшиеся и закончившиеся. */
  update(agentId: string, alerts: IAgentAlert[]): IAgentAlertChange[] {
    const previous = this._current.get(agentId) ?? new Map();
    const next = new Map(alerts.map(alert => [alert.key, alert]));
    const changes: IAgentAlertChange[] = [];

    for (const [key, alert] of previous) {
      if (!next.has(key)) changes.push({ ...alert, active: false });
    }
    for (const [key, alert] of next) {
      if (!previous.has(key)) changes.push({ ...alert, active: true });
    }
    if (next.size) this._current.set(agentId, next);
    else this._current.delete(agentId);

    return changes;
  }

  /** Агент удалён: его проблемы закончились. */
  forget(agentId: string): IAgentAlertChange[] {
    return this.update(agentId, []);
  }
}
