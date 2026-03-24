import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";

import { Injectable } from "../../core";
import { PermissionRepository } from "../permission";
import { EPermissions } from "../permission/permission.types";
import { Role } from "./role.entity";
import { RoleRepository } from "./role.repository";
import { ERole } from "./role.types";

const ROLE_DEFAULT_PERMISSIONS: Record<ERole, EPermissions[]> = {
  [ERole.ADMIN]: [EPermissions.ALL],
  [ERole.USER]: [
    EPermissions.WG_SERVER_OWN,
    EPermissions.WG_PEER_OWN,
    EPermissions.WG_STATS_VIEW,
  ],
  [ERole.GUEST]: [EPermissions.WG_PEER_OWN],
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

  /** Заменить набор разрешений роли на переданный список (upsert по имени). */
  async setRolePermissions(
    roleId: string,
    permissions: EPermissions[],
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
      let role = await this._roleRepository.findByName(roleName as ERole);

      if (!role) {
        role = await this._roleRepository.createAndSave({
          name: roleName as ERole,
        });
      }

      if (!role.permissions?.length) {
        await this.setRolePermissions(role.id, permissions);
      }
    }
  }
}
