import { multiInject, optional } from "inversify";

import { Injectable, InternalServerErrorException } from "../../core";
import { AGENT_CAPABILITY, IAgentCapability } from "./agent.capability";
import { ALP_INCOMING } from "./agent-link.protocol";

/** Сообщения, которые сессия обрабатывает сама. */
export const SESSION_MESSAGE_TYPES = ["status", "metrics"] as const;

/**
 * Возможности протокола из `AGENT_CAPABILITY`: тип входящего сообщения →
 * возможность. Тип без схемы протокола или обработанный дважды — ошибка
 * конфигурации при старте.
 */
@Injectable()
export class AgentCapabilityRegistry {
  private readonly _byType = new Map<string, IAgentCapability>();

  constructor(
    @multiInject(AGENT_CAPABILITY)
    @optional()
    private readonly _all: IAgentCapability[] = [],
  ) {
    const reserved = new Set<string>(SESSION_MESSAGE_TYPES);

    for (const capability of _all) {
      for (const type of capability.handles) {
        if (!ALP_INCOMING[type]) {
          throw new InternalServerErrorException(
            `[Agent] Тип ${type} не описан в протоколе ALP`,
          );
        }
        if (reserved.has(type) || this._byType.has(type)) {
          throw new InternalServerErrorException(
            `[Agent] Тип ${type} обрабатывается дважды`,
          );
        }
        this._byType.set(type, capability);
      }
    }
  }

  all(): readonly IAgentCapability[] {
    return this._all;
  }

  forType(type: string): IAgentCapability | undefined {
    return this._byType.get(type);
  }
}
