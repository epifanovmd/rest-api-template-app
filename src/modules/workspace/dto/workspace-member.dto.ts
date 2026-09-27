import { BaseDto } from "../../../core";
import type { TWorkspaceRole } from "../workspace.types";
import type { WorkspaceMember } from "../workspace-member.entity";

export class WorkspaceMemberDto extends BaseDto {
  workspaceId: string;
  userId: string;
  role: TWorkspaceRole;
  /** Когда вступил. */
  createdAt: Date;
  username: string | null;
  firstName: string | null;
  lastName: string | null;

  constructor(entity: WorkspaceMember) {
    super(entity);

    this.workspaceId = entity.workspaceId;
    this.userId = entity.userId;
    this.role = entity.role;
    this.createdAt = entity.createdAt;
    this.username = entity.user?.username ?? null;
    this.firstName = entity.user?.profile?.firstName ?? null;
    this.lastName = entity.user?.profile?.lastName ?? null;
  }

  static fromEntity(entity: WorkspaceMember) {
    return new WorkspaceMemberDto(entity);
  }
}
