import type { IAlpMetrics, IAlpStatus } from "../agent-link.protocol";

/** Агент зарегистрировался по токену (`null` — bootstrap-токен окружения). */
export class AgentEnrolledEvent {
  constructor(
    public readonly agentId: string,
    public readonly enrollmentTokenId: string | null,
  ) {}
}

/** Агент на связи: открыта новая сессия. */
export class AgentOnlineEvent {
  constructor(
    public readonly agentId: string,
    public readonly sessionId: string,
  ) {}
}

/** Возможности агента изменились после hello (ёмкость очередей). */
export class AgentCapabilitiesChangedEvent {
  constructor(public readonly agentId: string) {}
}

/** Агент пропал: сессия закрыта и за время ожидания не вернулся. */
export class AgentOfflineEvent {
  constructor(public readonly agentId: string) {}
}

/** Агент отозван: учётные данные больше не действуют. */
export class AgentRevokedEvent {
  constructor(
    public readonly agentId: string,
    public readonly revokedBy: string | undefined,
  ) {}
}

/** Живое состояние агента: новый `status` (смена состояния) или `metrics`. */
export class AgentLiveEvent {
  constructor(
    public readonly agentId: string,
    public readonly status?: IAlpStatus,
    public readonly metrics?: IAlpMetrics,
  ) {}
}

/** Команда агенту создана или сменила статус. */
export class AgentCommandUpdatedEvent {
  constructor(
    public readonly agentId: string,
    public readonly commandId: string,
  ) {}
}
