import type { TAssignableWorkspaceRole } from "../workspace.types";

export interface ICreateWorkspaceBody {
  name: string;
  /** Латиница, цифры и дефис; без него генерируется из названия. */
  slug?: string;
  description?: string;
}

export interface IUpdateWorkspaceBody {
  name?: string;
  slug?: string;
  /** Пустая строка очищает описание. */
  description?: string;
  /** `true` — архивировать, `false` — вернуть из архива. */
  archived?: boolean;
}

export interface IChangeWorkspaceMemberRoleBody {
  role: TAssignableWorkspaceRole;
}

export interface ITransferWorkspaceOwnershipBody {
  /** Новый владелец — действующий участник. */
  userId: string;
}

export interface ICreateWorkspaceInviteBody {
  email: string;
  role: TAssignableWorkspaceRole;
}

export interface IAcceptWorkspaceInviteBody {
  /** Токен из письма-приглашения. */
  token: string;
}
