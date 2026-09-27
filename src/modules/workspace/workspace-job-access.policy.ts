import { inject } from "inversify";

import {
  type IJobAccessPolicy,
  Injectable,
  type JobAccessAction,
} from "../../core";
import {
  type TWorkspaceRole,
  WORKSPACE_SCOPE,
  workspaceRoleCovers,
  WorkspaceRoles,
} from "./workspace.types";
import { WorkspaceAccessService } from "./workspace-access.service";

/** Минимальная роль для действия с задачей пространства. */
const REQUIRED_ROLE: Record<JobAccessAction, TWorkspaceRole> = {
  view: WorkspaceRoles.VIEWER,
  cancel: WorkspaceRoles.EDITOR,
};

/** Задачи со scope `workspace`: видят участники, отменяют — editor и выше. */
@Injectable()
export class WorkspaceJobAccessPolicy implements IJobAccessPolicy {
  readonly scopeType = WORKSPACE_SCOPE;

  constructor(
    @inject(WorkspaceAccessService)
    private readonly _access: WorkspaceAccessService,
  ) {}

  async canAccess(
    userId: string,
    scopeId: string,
    action: JobAccessAction,
  ): Promise<boolean> {
    const role = await this._access.roleOf(userId, scopeId);

    return (
      !!role &&
      workspaceRoleCovers(role, REQUIRED_ROLE[action] ?? WorkspaceRoles.OWNER)
    );
  }

  /** Видит ли участник задачи пространства. */
  canView(userId: string, scopeId: string): Promise<boolean> {
    return this.canAccess(userId, scopeId, "view");
  }
}
