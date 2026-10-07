import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { ISocketEventListener, SocketEmitterService } from "../socket";
import { AgentService } from "./agent.service";
import { AgentCommandService } from "./agent-command.service";
import { agentRoom, AGENTS_ROOM } from "./agent-room.policy";
import {
  AgentCapabilitiesChangedEvent,
  AgentCommandUpdatedEvent,
  AgentEnrolledEvent,
  AgentLiveEvent,
  AgentOfflineEvent,
  AgentOnlineEvent,
  AgentRevokedEvent,
} from "./events";

/** События агентов → сокет: список агентов, живое состояние, команды. */
@Injectable()
export class AgentListener implements ISocketEventListener {
  constructor(
    @inject(EventBus) private readonly _eventBus: EventBus,
    @inject(SocketEmitterService)
    private readonly _emitter: SocketEmitterService,
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(AgentCommandService)
    private readonly _commands: AgentCommandService,
  ) {}

  register(): void {
    const updated = ({ agentId }: { agentId: string }) =>
      void this._sendAgent(agentId);

    this._eventBus.on(AgentEnrolledEvent, updated);
    this._eventBus.on(AgentOnlineEvent, updated);
    this._eventBus.on(AgentOfflineEvent, updated);
    this._eventBus.on(AgentRevokedEvent, updated);
    this._eventBus.on(AgentCapabilitiesChangedEvent, updated);
    this._eventBus.on(AgentLiveEvent, ({ agentId, status, metrics }) =>
      this._emitter.toRoom(agentRoom(agentId), "agent:live", {
        agentId,
        ...(status && { status }),
        ...(metrics && { metrics }),
      }),
    );
    this._eventBus.on(
      AgentCommandUpdatedEvent,
      ({ agentId, commandId }) => void this._sendCommand(agentId, commandId),
    );
  }

  private async _sendAgent(id: string): Promise<void> {
    try {
      this._emitter.toRoom(
        AGENTS_ROOM,
        "agent:updated",
        await this._agents.getSummary(id),
      );
    } catch (err) {
      logger.warn({ err, agentId: id }, "[Agent] agent:updated не отправлено");
    }
  }

  private async _sendCommand(agentId: string, id: string): Promise<void> {
    try {
      this._emitter.toRoom(
        agentRoom(agentId),
        "agent:command",
        await this._commands.get(id),
      );
    } catch (err) {
      logger.warn(
        { err, commandId: id },
        "[Agent] agent:command не отправлено",
      );
    }
  }
}
