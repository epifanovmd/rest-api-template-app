import { workspaceConfig } from "./workspace.config";

/**
 * Роль участника пространства. Иерархия owner ⊃ admin ⊃ editor ⊃ viewer:
 * старшая роль умеет всё, что младшая. Набор закрыт — от него зависит ранг.
 */
export const WorkspaceRoles = {
  /** Всё, включая удаление пространства и передачу владения */
  OWNER: "owner",
  /** Участники, приглашения, настройки пространства */
  ADMIN: "admin",
  /** Изменение содержимого пространства */
  EDITOR: "editor",
  /** Только просмотр */
  VIEWER: "viewer",
} as const;

export type TWorkspaceRole =
  (typeof WorkspaceRoles)[keyof typeof WorkspaceRoles];

export const WORKSPACE_ROLES = Object.values(WorkspaceRoles);

/** Роль, которая назначается напрямую; owner — только передачей владения. */
export type TAssignableWorkspaceRole = "admin" | "editor" | "viewer";

export const ASSIGNABLE_WORKSPACE_ROLES: TAssignableWorkspaceRole[] = [
  WorkspaceRoles.ADMIN,
  WorkspaceRoles.EDITOR,
  WorkspaceRoles.VIEWER,
];

const WORKSPACE_ROLE_RANK: Record<TWorkspaceRole, number> = {
  [WorkspaceRoles.VIEWER]: 1,
  [WorkspaceRoles.EDITOR]: 2,
  [WorkspaceRoles.ADMIN]: 3,
  [WorkspaceRoles.OWNER]: 4,
};

export const workspaceRoleRank = (role: TWorkspaceRole): number =>
  WORKSPACE_ROLE_RANK[role] ?? 0;

/** Покрывает ли роль требуемую. */
export const workspaceRoleCovers = (
  role: TWorkspaceRole,
  required: TWorkspaceRole,
): boolean => workspaceRoleRank(role) >= workspaceRoleRank(required);

export const isWorkspaceRole = (value: unknown): value is TWorkspaceRole =>
  typeof value === "string" &&
  (WORKSPACE_ROLES as readonly string[]).includes(value);

/** Комната Socket.IO пространства. */
export const workspaceRoom = (workspaceId: string): string =>
  `workspace_${workspaceId}`;

/** Тип комнаты в `room:subscribe` и scope задач. */
export const WORKSPACE_SCOPE = "workspace";

/** Сколько жить закэшированной роли, секунд. */
export const WORKSPACE_ROLE_CACHE_TTL_SECONDS = 30;

/** Срок действия приглашения. */
export const WORKSPACE_INVITE_TTL_MS =
  workspaceConfig.inviteTtlHours * 60 * 60 * 1000;

/** Состояние приглашения — вычисляется из дат, не хранится. */
export const WorkspaceInviteStatuses = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REVOKED: "revoked",
  EXPIRED: "expired",
} as const;

export type TWorkspaceInviteStatus =
  (typeof WorkspaceInviteStatuses)[keyof typeof WorkspaceInviteStatuses];

/**
 * Членство, подтверждённое проверкой доступа. `viaSuperuser` — доступ дан
 * глобальной ролью, записи участника может не быть; роль тогда — owner.
 */
export interface IWorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: TWorkspaceRole;
  viaSuperuser: boolean;
}

/** Длины колонок — общие для сущностей и схем валидации. */
export const WORKSPACE_NAME_MAX = 100;
export const WORKSPACE_DESCRIPTION_MAX = 1000;
export const WORKSPACE_SLUG_MIN = 3;
export const WORKSPACE_SLUG_MAX = 64;
export const WORKSPACE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const WORKSPACE_INVITE_EMAIL_MAX = 50;
