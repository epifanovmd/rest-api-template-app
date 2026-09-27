import { BaseDto } from "../../../core";
import {
  type TWorkspaceInviteStatus,
  type TWorkspaceRole,
  WorkspaceInviteStatuses,
} from "../workspace.types";
import type { WorkspaceInvite } from "../workspace-invite.entity";

const inviteStatus = (
  invite: WorkspaceInvite,
  now: Date,
): TWorkspaceInviteStatus => {
  if (invite.acceptedAt) return WorkspaceInviteStatuses.ACCEPTED;
  if (invite.revokedAt) return WorkspaceInviteStatuses.REVOKED;
  if (invite.expiresAt <= now) return WorkspaceInviteStatuses.EXPIRED;

  return WorkspaceInviteStatuses.PENDING;
};

/** Приглашение без токена: токен есть только в письме. */
export class WorkspaceInviteDto extends BaseDto {
  id: string;
  workspaceId: string;
  email: string;
  role: TWorkspaceRole;
  invitedBy: string | null;
  status: TWorkspaceInviteStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;

  constructor(entity: WorkspaceInvite, now = new Date()) {
    super(entity);

    this.id = entity.id;
    this.workspaceId = entity.workspaceId;
    this.email = entity.email;
    this.role = entity.role;
    this.invitedBy = entity.invitedBy;
    this.status = inviteStatus(entity, now);
    this.expiresAt = entity.expiresAt;
    this.acceptedAt = entity.acceptedAt;
    this.revokedAt = entity.revokedAt;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: WorkspaceInvite) {
    return new WorkspaceInviteDto(entity);
  }
}
