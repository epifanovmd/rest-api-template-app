import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";

import { Injectable } from "../../core";
import { PermissionRepository } from "../permission";
import { Permissions, TPermission } from "../permission/permission.types";
import { Role } from "./role.entity";
import { RoleRepository } from "./role.repository";
import { Roles, TRole } from "./role.types";

const ROLE_DEFAULT_PERMISSIONS: Record<string, TPermission[]> = {
  [Roles.ADMIN]: [Permissions.ALL],
  [Roles.USER]: [Permissions.USER_VIEW, Permissions.USER_MANAGE],
  [Roles.GUEST]: [Permissions.USER_VIEW],
};

/** Сервис для управления ролями и их разрешениями. */
@Injectable()
export class RoleService {
  constructor(
    @inject(RoleRepository) private _roleRepository: RoleRepository,
    @inject(PermissionRepository)
    private _permissionRepository: PermissionRepository,
  ) {}

  /** Получить все роли с их разрешениями. */
  async getRoles(): Promise<Role[]> {
    return this._roleRepository.findAll();
  }

  /** Создать новую роль. */
  async createRole(name: TRole): Promise<Role> {
    const existing = await this._roleRepository.findByName(name);

    if (existing) {
      return existing;
    }

    return this._roleRepository.createAndSave({ name });
  }

  /** Удалить роль по ID. */
  async deleteRole(roleId: string): Promise<void> {
    const role = await this._roleRepository.findById(roleId);

    if (!role) {
      throw new NotFoundException("Роль не найдена");
    }

    await this._roleRepository.delete({ id: roleId });
  }

  /** Заменить набор разрешений роли на переданный список (upsert по имени). */
  async setRolePermissions(
    roleId: string,
    permissions: TPermission[],
  ): Promise<Role> {
    const role = await this._roleRepository.findById(roleId);

    if (!role) {
      throw new NotFoundException("Роль не найдена");
    }

    role.permissions = await Promise.all(
      permissions.map(async permName => {
        let perm = await this._permissionRepository.findByName(permName);

        if (!perm) {
          perm = await this._permissionRepository.createAndSave({
            name: permName,
          });
        }

        return perm;
      }),
    );

    await this._roleRepository.save(role);

    return this._roleRepository.findById(roleId) as Promise<Role>;
  }

  /**
   * Засеивает разрешения по умолчанию для каждой роли.
   * Устанавливает разрешения только если у роли их ещё нет (сохраняет ручные изменения).
   */
  async seedDefaultPermissions(): Promise<void> {
    for (const [roleName, permissions] of Object.entries(
      ROLE_DEFAULT_PERMISSIONS,
    )) {
      let role = await this._roleRepository.findByName(roleName);

      if (!role) {
        role = await this._roleRepository.createAndSave({
          name: roleName,
        });
      }

      if (!role.permissions?.length) {
        await this.setRolePermissions(role.id, permissions);
      }
    }
  }
}
