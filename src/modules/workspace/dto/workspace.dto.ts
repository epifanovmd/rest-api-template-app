import { BaseDto } from "../../../core";
import type { Workspace } from "../workspace.entity";
import type { TWorkspaceRole } from "../workspace.types";

export class WorkspaceDto extends BaseDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** `null` — владелец удалён, владение передаётся. */
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  /** Роль текущего пользователя в пространстве. */
  role?: TWorkspaceRole;

  constructor(entity: Workspace, role?: TWorkspaceRole) {
    super(entity);

    this.id = entity.id;
    this.name = entity.name;
    this.slug = entity.slug;
    this.description = entity.description ?? null;
    this.ownerId = entity.ownerId;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.archivedAt = entity.archivedAt;
    this.role = role;
  }

  static fromEntity(entity: Workspace, role?: TWorkspaceRole) {
    return new WorkspaceDto(entity, role);
  }
}
