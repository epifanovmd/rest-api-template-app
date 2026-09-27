/**
 * Сокет-события модуля: дополняют контракт `socket.types` (declare module
 * работает только с модулем-объявлением, не с index).
 */
export interface ISocketWorkspaceMemberPayload {
  workspaceId: string;
  userId: string;
}

export interface ISocketWorkspaceMemberRolePayload extends ISocketWorkspaceMemberPayload {
  role: string;
  previousRole?: string;
}

declare module "../socket/socket.types" {
  interface ISocketEmitEvents {
    /** Участник добавлен в пространство */
    "workspace:member-added": (
      ...args: [ISocketWorkspaceMemberRolePayload]
    ) => void;
    /** Участник удалён из пространства или вышел */
    "workspace:member-removed": (
      ...args: [ISocketWorkspaceMemberPayload]
    ) => void;
    /** Роль участника пространства изменена */
    "workspace:member-role-changed": (
      ...args: [ISocketWorkspaceMemberRolePayload]
    ) => void;
    /** Пространство удалено */
    "workspace:deleted": (...args: [{ workspaceId: string }]) => void;
  }
}
