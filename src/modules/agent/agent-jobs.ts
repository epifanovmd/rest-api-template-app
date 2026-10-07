import { inject } from "inversify";

import {
  IJobHandler,
  Injectable,
  JobContext,
  JobDefinition,
  logger,
} from "../../core";
import { AgentService } from "./agent.service";
import {
  AGENT_COMMAND_RETENTION_DAYS,
  AGENT_EPHEMERAL_FORGET_HOURS,
  AGENT_LINK_LOST_QUEUE,
  AGENT_RETENTION_QUEUE,
  AGENT_SWEEP_QUEUE,
} from "./agent.types";
import { AgentCommandService } from "./agent-command.service";

const HOUR_MS = 3_600_000;

export interface IAgentLinkLostData {
  agentId: string;
  sessionId: string;
  /** ISO-время разрыва. */
  disconnectedAt: string;
}

/** Агент не вернулся после разрыва за время ожидания — offline. */
@Injectable()
export class AgentLinkLostJob implements IJobHandler<IAgentLinkLostData> {
  readonly definition: JobDefinition = {
    queue: AGENT_LINK_LOST_QUEUE,
    retryLimit: 2,
    expireInSeconds: 60,
  };

  constructor(@inject(AgentService) private readonly _agents: AgentService) {}

  async handle({ data }: JobContext<IAgentLinkLostData>): Promise<void> {
    await this._agents.markOfflineIfSilent(
      data.agentId,
      data.sessionId,
      new Date(data.disconnectedAt),
    );
  }
}

/**
 * Раз в минуту: агенты без пульса — offline (страховка к проверке разрыва:
 * процесс с сессией упал), команды без итога дольше таймаута — `timeout`.
 */
@Injectable()
export class AgentSweepJob implements IJobHandler {
  readonly definition: JobDefinition = {
    queue: AGENT_SWEEP_QUEUE,
    cron: "* * * * *",
    retryLimit: 0,
    expireInSeconds: 60,
  };

  constructor(
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(AgentCommandService)
    private readonly _commands: AgentCommandService,
  ) {}

  async handle(): Promise<void> {
    const offline = await this._agents.sweepSilent();
    const timedOut = await this._commands.sweepTimeouts();

    if (offline || timedOut) {
      logger.info({ offline, timedOut }, "[Agent] Обход: offline и таймауты");
    }
  }
}

/** Раз в сутки: старые команды и забытые эфемерные агенты. */
@Injectable()
export class AgentRetentionJob implements IJobHandler {
  readonly definition: JobDefinition = {
    queue: AGENT_RETENTION_QUEUE,
    cron: "45 3 * * *",
    retryLimit: 1,
    expireInSeconds: 600,
  };

  constructor(
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(AgentCommandService)
    private readonly _commands: AgentCommandService,
  ) {}

  async handle(): Promise<void> {
    const commands = await this._commands.purgeSettledBefore(
      new Date(Date.now() - AGENT_COMMAND_RETENTION_DAYS * 24 * HOUR_MS),
    );
    const agents = await this._agents.forgetEphemeral(
      new Date(Date.now() - AGENT_EPHEMERAL_FORGET_HOURS * HOUR_MS),
    );

    if (commands || agents) {
      logger.info({ commands, agents }, "[Agent] Удалены старые записи");
    }
  }
}
