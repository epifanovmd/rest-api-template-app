import { asJobAccessPolicy, Module } from "../../core";
import {
  asSocketListener,
  asSocketRoomPolicy,
  asSocketRoomProvider,
} from "../socket";
import { WorkspaceController } from "./workspace.controller";
import { Workspace } from "./workspace.entity";
import { WorkspaceListener } from "./workspace.listener";
import { WorkspaceRepository } from "./workspace.repository";
import { WorkspaceRoomPolicy } from "./workspace.room-policy";
import { WorkspaceRoomProvider } from "./workspace.room-provider";
import { WorkspaceService } from "./workspace.service";
import { WorkspaceAccessService } from "./workspace-access.service";
import { WorkspaceInviteController } from "./workspace-invite.controller";
import { WorkspaceInvite } from "./workspace-invite.entity";
import { WorkspaceInviteMailer } from "./workspace-invite.mail";
import { WorkspaceInviteRepository } from "./workspace-invite.repository";
import { WorkspaceInviteService } from "./workspace-invite.service";
import { WorkspaceJobAccessPolicy } from "./workspace-job-access.policy";
import { WorkspaceMember } from "./workspace-member.entity";
import { WorkspaceMemberRepository } from "./workspace-member.repository";
import { WorkspaceMemberService } from "./workspace-member.service";
import { WorkspaceRoleCache } from "./workspace-role.cache";

/** Рабочие пространства: участники, роли, приглашения, права на комнаты. */
@Module({
  entities: [Workspace, WorkspaceMember, WorkspaceInvite],
  providers: [
    WorkspaceRepository,
    WorkspaceMemberRepository,
    WorkspaceInviteRepository,
    WorkspaceRoleCache,
    WorkspaceAccessService,
    WorkspaceService,
    WorkspaceMemberService,
    WorkspaceInviteMailer,
    WorkspaceInviteService,
    WorkspaceController,
    WorkspaceInviteController,
    asSocketRoomProvider(WorkspaceRoomProvider),
    asSocketRoomPolicy(WorkspaceRoomPolicy),
    asJobAccessPolicy(WorkspaceJobAccessPolicy),
    asSocketListener(WorkspaceListener),
  ],
})
export class WorkspaceModule {}
