import { inject } from "inversify";

import {
  EventBus,
  Injectable,
  IPaginatedDto,
  normalizePagination,
  toPage,
} from "../../core";
import { AgentError } from "./agent.errors";
import { AgentRepository } from "./agent.repository";
import {
  AGENT_COMMAND_DEFAULT_TIMEOUT_SEC,
  AGENT_COMMAND_OUTPUT_MAX,
  AGENT_COMMAND_TIMEOUT_GRACE_SEC,
  AGENT_SIGNAL_CHANNEL,
  EAgentCommandStatus,
  SETTLED_AGENT_COMMAND_STATUSES,
} from "./agent.types";
import { AgentCommand, IAgentCommandError } from "./agent-command.entity";
import { AgentCommandRepository } from "./agent-command.repository";
import { AgentReleaseService } from "./agent-release.service";
import { AgentSignals } from "./agent-signals";
import { AgentCommandDto, ICreateAgentCommandBody } from "./dto";
import { AgentCommandUpdatedEvent } from "./events";

/** Итог команды от агента. */
export interface IAgentCommandOutcome {
  ok: boolean;
  exitCode?: number;
  result?: unknown;
  error?: IAgentCommandError;
}

const ACTIVE = [EAgentCommandStatus.PENDING, EAgentCommandStatus.RUNNING];

/** Загрузка и замена исполняемого файла — не дольше. */
const AGENT_UPDATE_TIMEOUT_SEC = 600;

/**
 * Команды агентам: создание (белый список агента), доставка ожидающих,
 * жизненный цикл `pending → running → succeeded | failed | timeout`.
 */
@Injectable()
export class AgentCommandService {
  constructor(
    @inject(AgentCommandRepository)
    private readonly _commands: AgentCommandRepository,
    @inject(AgentRepository) private readonly _agents: AgentRepository,
    @inject(AgentSignals) private readonly _signals: AgentSignals,
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(AgentReleaseService)
    private readonly _releases: AgentReleaseService,
  ) {}

  /** Поручить команду агенту; доставка — сразу, если агент на связи. */
  async create(
    agentId: string,
    body: ICreateAgentCommandBody,
    requestedBy: string | null,
  ): Promise<AgentCommandDto> {
    const agent = await this._agents.findById(agentId);

    if (!agent) throw AgentError.NOT_FOUND();
    if (agent.revokedAt) throw AgentError.REVOKED();
    if (!agent.capabilities.commands?.names.includes(body.name)) {
      throw AgentError.COMMAND_NOT_SUPPORTED({ name: body.name });
    }

    const command = await this._commands.createAndSave({
      agentId,
      name: body.name,
      args: body.args ?? null,
      status: EAgentCommandStatus.PENDING,
      output: "",
      result: null,
      error: null,
      exitCode: null,
      timeoutSec: body.timeoutSec ?? AGENT_COMMAND_DEFAULT_TIMEOUT_SEC,
      requestedBy,
      startedAt: null,
      finishedAt: null,
    });

    await this._signals.notify(AGENT_SIGNAL_CHANNEL, agentId);
    this._emit(command);

    return AgentCommandDto.fromEntity(command);
  }

  /**
   * Обновить агента до версии (по умолчанию — последней): команда
   * `agent.update` со сборкой под его ОС и архитектуру. Сборка без подписи
   * не ставится — агент её не примет.
   */
  async createUpdate(
    agentId: string,
    version: string | undefined,
    requestedBy: string | null,
  ): Promise<AgentCommandDto> {
    const agent = await this._agents.findById(agentId);

    if (!agent) throw AgentError.NOT_FOUND();
    if (!agent.host?.os || !agent.host.arch) {
      throw AgentError.RELEASE_NOT_FOUND({ reason: "host unknown" });
    }

    const { release, artifact } = await this._releases.artifact(
      agent.host.os,
      agent.host.arch,
      version,
    );

    if (!artifact.signature) throw AgentError.RELEASE_UNSIGNED();

    return this.create(
      agentId,
      {
        name: "agent.update",
        args: {
          version: release.version,
          url: `/api/v1/agent-link/releases/${release.version}/${artifact.os}/${artifact.arch}`,
          sha256: artifact.sha256,
          signature: artifact.signature,
        },
        timeoutSec: AGENT_UPDATE_TIMEOUT_SEC,
      },
      requestedBy,
    );
  }

  async list(
    agentId: string,
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<AgentCommandDto>> {
    const page = normalizePagination(offset, limit);
    const [commands, total] = await this._commands.findPage(
      agentId,
      page.offset,
      page.limit,
    );

    return toPage(commands.map(AgentCommandDto.fromEntity), total, page);
  }

  async get(id: string): Promise<AgentCommandDto> {
    const command = await this._commands.findById(id);

    if (!command) throw AgentError.COMMAND_NOT_FOUND();

    return AgentCommandDto.fromEntity(command);
  }

  /** Отменить команду: итог агента после отмены не принимается. */
  async cancel(id: string): Promise<void> {
    const command = await this._commands.findById(id);

    if (!command) throw AgentError.COMMAND_NOT_FOUND();
    if (SETTLED_AGENT_COMMAND_STATUSES.includes(command.status)) {
      throw AgentError.COMMAND_NOT_CANCELLABLE();
    }

    await this._settle(command, ACTIVE, {
      status: EAgentCommandStatus.CANCELLED,
    });
  }

  /** Команды, ждущие доставки агенту. */
  pending(agentId: string): Promise<AgentCommand[]> {
    return this._commands.findPending(agentId);
  }

  /** Агент принял команду. */
  async accept(agentId: string, commandId: string): Promise<void> {
    const command = await this._find(agentId, commandId);

    if (
      await this._commands.transition(
        command.id,
        [EAgentCommandStatus.PENDING],
        { status: EAgentCommandStatus.RUNNING, startedAt: new Date() },
      )
    ) {
      this._emit(command);
    }
  }

  /** Кусок вывода команды: хранится хвост не длиннее предела. */
  async output(
    agentId: string,
    commandId: string,
    chunk: string,
  ): Promise<void> {
    await this._find(agentId, commandId);
    await this._commands
      .createQueryBuilder()
      .update()
      .set({ output: () => "right(output || :chunk, :max)" })
      .setParameters({ chunk, max: AGENT_COMMAND_OUTPUT_MAX })
      .where("id = :id AND status IN (:...active)", {
        id: commandId,
        active: ACTIVE,
      })
      .execute();
  }

  /** Итог команды; повтор после итога — без изменений. */
  async done(
    agentId: string,
    commandId: string,
    outcome: IAgentCommandOutcome,
  ): Promise<void> {
    const command = await this._find(agentId, commandId);

    await this._settle(command, ACTIVE, {
      status: outcome.ok
        ? EAgentCommandStatus.SUCCEEDED
        : EAgentCommandStatus.FAILED,
      exitCode: outcome.exitCode ?? null,
      result: outcome.result ?? null,
      error: outcome.error ?? null,
    });
  }

  /** Команды без итога дольше своего таймаута (с запасом) — `timeout`. */
  async sweepTimeouts(): Promise<number> {
    const rows: { id: string; agent_id: string }[] = await this._commands
      .createQueryBuilder()
      .update()
      .set({
        status: EAgentCommandStatus.TIMEOUT,
        finishedAt: () => "now()",
        error: {
          code: "TIMEOUT",
          message: "Агент не сообщил итог команды вовремя",
        },
      })
      .where("status IN (:...active)", { active: ACTIVE })
      .andWhere(
        "created_at + make_interval(secs => timeout_sec + :grace) < now()",
        { grace: AGENT_COMMAND_TIMEOUT_GRACE_SEC },
      )
      .returning(["id", "agent_id"])
      .execute()
      .then(result => result.raw);

    rows.forEach(row =>
      this._eventBus.emit(new AgentCommandUpdatedEvent(row.agent_id, row.id)),
    );

    return rows.length;
  }

  purgeSettledBefore(before: Date): Promise<number> {
    return this._commands.deleteSettledBefore(before);
  }

  private async _find(
    agentId: string,
    commandId: string,
  ): Promise<AgentCommand> {
    const command = await this._commands.findById(commandId);

    if (!command || command.agentId !== agentId) {
      throw AgentError.COMMAND_NOT_FOUND();
    }

    return command;
  }

  private async _settle(
    command: AgentCommand,
    from: EAgentCommandStatus[],
    patch: Partial<AgentCommand> & { status: EAgentCommandStatus },
  ): Promise<void> {
    if (
      await this._commands.transition(command.id, from, {
        ...patch,
        finishedAt: new Date(),
      })
    ) {
      this._emit(command);
    }
  }

  private _emit(command: Pick<AgentCommand, "id" | "agentId">): void {
    this._eventBus.emit(
      new AgentCommandUpdatedEvent(command.agentId, command.id),
    );
  }
}
