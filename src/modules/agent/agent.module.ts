import "./agent.permissions";

import { asJobHandler, asSecurityScheme, Module } from "../../core";
import {
  asSocketListener,
  asSocketRoomPolicy,
  permissionRoomPolicy,
} from "../socket";
import { asAgentCapability } from "./agent.capability";
import { AgentController } from "./agent.controller";
import { Agent } from "./agent.entity";
import { AgentListener } from "./agent.listener";
import { AgentPermissions } from "./agent.permissions";
import { AgentRepository } from "./agent.repository";
import { AgentSecurityScheme } from "./agent.scheme";
import { AgentService } from "./agent.service";
import { AgentCapabilityRegistry } from "./agent-capability.registry";
import { AgentCommandController } from "./agent-command.controller";
import { AgentCommand } from "./agent-command.entity";
import { AgentCommandRepository } from "./agent-command.repository";
import { AgentCommandService } from "./agent-command.service";
import { AgentCommandsCapability } from "./agent-commands.capability";
import { AgentEnrollmentTokenController } from "./agent-enrollment.controller";
import { AgentEnrollmentService } from "./agent-enrollment.service";
import { AgentEnrollmentToken } from "./agent-enrollment-token.entity";
import { AgentEnrollmentTokenRepository } from "./agent-enrollment-token.repository";
import {
  AgentLinkLostJob,
  AgentRetentionJob,
  AgentSweepJob,
} from "./agent-jobs";
import { AgentLinkController } from "./agent-link.controller";
import { AgentLinkGateway } from "./agent-link.gateway";
import { AgentPresenceStore } from "./agent-presence.store";
import { AgentReleaseController } from "./agent-release.controller";
import { AgentReleaseService } from "./agent-release.service";
import { AgentRoomPolicy, AGENTS_ROOM } from "./agent-room.policy";
import { AgentSessionHub } from "./agent-session.hub";
import { AgentSignals } from "./agent-signals";
import { AgentStateCapability } from "./agent-state.capability";
import { AgentSyncService } from "./agent-sync.service";

/**
 * Агенты: регистрация, канал ALP (WebSocket), сессии и присутствие, команды,
 * желаемое состояние. Задачи и домены подключаются возможностями
 * (`asAgentCapability`, `asAgentStateProvider`).
 */
@Module({
  entities: [Agent, AgentEnrollmentToken, AgentCommand],
  providers: [
    AgentRepository,
    AgentEnrollmentTokenRepository,
    AgentCommandRepository,
    AgentSignals,
    AgentPresenceStore,
    AgentService,
    AgentEnrollmentService,
    AgentCommandService,
    AgentSessionHub,
    AgentCapabilityRegistry,
    AgentReleaseService,
    AgentSyncService,
    asSecurityScheme(AgentSecurityScheme),
    asAgentCapability(AgentCommandsCapability),
    asAgentCapability(AgentStateCapability),
    AgentController,
    AgentCommandController,
    AgentEnrollmentTokenController,
    AgentLinkController,
    AgentReleaseController,
    asSocketListener(AgentListener),
    asSocketRoomPolicy(
      permissionRoomPolicy(AGENTS_ROOM, AgentPermissions.VIEW),
    ),
    asSocketRoomPolicy(AgentRoomPolicy),
    asJobHandler(AgentLinkLostJob),
    asJobHandler(AgentSweepJob),
    asJobHandler(AgentRetentionJob),
  ],
  bootstrappers: [AgentLinkGateway],
})
export class AgentModule {}
