import { inject } from "inversify";
import { DataSource } from "typeorm";

import { Injectable, PgSignals } from "../../core";
import { AGENT_SIGNAL_CHANNELS, TAgentSignalChannel } from "./agent.types";

/**
 * Сигналы агентам между процессами (LISTEN/NOTIFY): сессия агента живёт в
 * одном процессе, а поручение (команда, отмена, новое состояние) рождается в
 * любом. Механизм — `PgSignals` ядра.
 */
@Injectable()
export class AgentSignals extends PgSignals<TAgentSignalChannel> {
  constructor(@inject(DataSource) dataSource: DataSource) {
    super(dataSource, AGENT_SIGNAL_CHANNELS, "agent-signals");
  }
}
