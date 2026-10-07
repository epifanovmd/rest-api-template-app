import { multiInject, optional } from "inversify";

import { Injectable, logger, type TokenProvider } from "../../core";
import type {
  IAgentCapability,
  IAgentMessage,
  IAgentSession,
} from "./agent.capability";
import type { TAlpStateApplied } from "./agent-link.protocol";

/**
 * Токен multi-inject поставщиков желаемого состояния: модуль домена (`wg`)
 * регистрирует `asAgentStateProvider(Cls)` и строит снимок для агента.
 */
export const AGENT_STATE_PROVIDER = Symbol("AgentStateProvider");

/** Снимок желаемого состояния домена с монотонной версией. */
export interface IAgentDesiredState {
  version: number;
  spec: unknown;
}

export interface IAgentStateProvider {
  /** Домен состояния: ключ в `hello.capabilities.state.domains`. */
  readonly domain: string;
  /** Текущий снимок для агента; `null` — агенту домен не назначен. */
  build(agentId: string): Promise<IAgentDesiredState | null>;
  /** Агент применил (или не смог применить) версию. */
  onApplied?(agentId: string, applied: TAlpStateApplied): Promise<void>;
}

export const asAgentStateProvider = (
  cls: new (...args: any[]) => IAgentStateProvider,
): TokenProvider<IAgentStateProvider> => ({
  provide: AGENT_STATE_PROVIDER,
  useClass: cls,
});

/**
 * Возможность `state`: желаемое состояние доменов — полный снимок, если его
 * версия новее известной агенту. Изменение домена доставляется сигналом
 * агенту (`AgentSignals`, канал `agent_signal`).
 */
@Injectable()
export class AgentStateCapability implements IAgentCapability {
  readonly handles = ["state.applied"] as const;

  private readonly _providers: Map<string, IAgentStateProvider>;
  /** Версия домена, известная агенту в сессии: применённая или отправленная. */
  private readonly _known = new WeakMap<IAgentSession, Map<string, number>>();

  constructor(
    @multiInject(AGENT_STATE_PROVIDER)
    @optional()
    providers: IAgentStateProvider[] = [],
  ) {
    this._providers = new Map(providers.map(p => [p.domain, p]));
  }

  onOpen(session: IAgentSession): Promise<void> {
    const domains = session.hello.capabilities.state?.domains ?? {};

    this._known.set(
      session,
      new Map(
        Object.entries(domains).map(([domain, version]) => [
          domain,
          version ?? -1,
        ]),
      ),
    );

    return this.deliver(session);
  }

  /** Известные версии — из прежнего hello: лишний state.put агент пропустит. */
  onResume(session: IAgentSession): Promise<void> {
    return this.onOpen(session);
  }

  async deliver(session: IAgentSession): Promise<void> {
    const known = this._known.get(session);

    if (!known) return;

    for (const [domain] of known) {
      const provider = this._providers.get(domain);

      if (!provider) continue;

      const state = await provider.build(session.agentId);

      if (!state || state.version <= (known.get(domain) ?? -1)) continue;

      known.set(domain, state.version);
      session.send("state.put", { domain, ...state });
    }
  }

  async onMessage(
    session: IAgentSession,
    message: IAgentMessage,
  ): Promise<void> {
    const applied = message.data as TAlpStateApplied;
    const provider = this._providers.get(applied.domain);

    if (!provider?.onApplied) return;

    try {
      await provider.onApplied(session.agentId, applied);
    } catch (err) {
      logger.error(
        { err, agentId: session.agentId, domain: applied.domain },
        "[Agent] onApplied домена упал",
      );
      throw err;
    }
  }
}
