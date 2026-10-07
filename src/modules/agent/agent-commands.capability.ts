import { inject } from "inversify";

import { Injectable } from "../../core";
import type {
  IAgentCapability,
  IAgentMessage,
  IAgentSession,
} from "./agent.capability";
import { AgentCommandService } from "./agent-command.service";

interface ICommandRef {
  commandId: string;
}

interface ICommandOutput extends ICommandRef {
  chunk: string;
}

interface ICommandDone extends ICommandRef {
  ok: boolean;
  exitCode?: number;
  result?: unknown;
  error?: { code: string; message: string };
}

/**
 * Возможность `commands`: доставка ожидающих команд (`cmd.run`) и их
 * жизненный цикл. Повторная доставка после переподключения безопасна —
 * агент дедуплицирует по `commandId`.
 */
@Injectable()
export class AgentCommandsCapability implements IAgentCapability {
  readonly handles = ["cmd.accept", "cmd.output", "cmd.done"] as const;

  /** Что уже отправлено в сессию: повторная доставка — только после переподключения. */
  private readonly _sent = new WeakMap<IAgentSession, Set<string>>();

  constructor(
    @inject(AgentCommandService)
    private readonly _commands: AgentCommandService,
  ) {}

  onOpen(session: IAgentSession): Promise<void> {
    this._sent.set(session, new Set());

    return this.deliver(session);
  }

  onResume(session: IAgentSession): Promise<void> {
    return this.onOpen(session);
  }

  async deliver(session: IAgentSession): Promise<void> {
    if (!session.supports("commands")) return;

    const sent = this._sent.get(session) ?? new Set<string>();

    for (const command of await this._commands.pending(session.agentId)) {
      if (sent.has(command.id)) continue;

      sent.add(command.id);
      session.send("cmd.run", {
        commandId: command.id,
        name: command.name,
        ...(command.args !== null && { args: command.args }),
        timeoutSec: command.timeoutSec,
      });
    }
  }

  async onMessage(
    session: IAgentSession,
    message: IAgentMessage,
  ): Promise<void> {
    const { agentId } = session;

    switch (message.type) {
      case "cmd.accept":
        return this._commands.accept(
          agentId,
          (message.data as ICommandRef).commandId,
        );
      case "cmd.output": {
        const { commandId, chunk } = message.data as ICommandOutput;

        return this._commands.output(agentId, commandId, chunk);
      }
      case "cmd.done": {
        const { commandId, ...outcome } = message.data as ICommandDone;

        return this._commands.done(agentId, commandId, outcome);
      }
    }
  }
}
