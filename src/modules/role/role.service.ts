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
    EPermissions.WG_SERVER_VIEW,
    EPermissions.WG_PEER_VIEW,
    EPermissions.WG_PEER_OWN,
    EPermissions.WG_STATS_VIEW,
  ],
  [ERole.GUEST]: [EPermissions.WG_SERVER_VIEW],
};

@Injectable()
export class RoleService {
  constructor(
    @inject(RoleRepository) private _roleRepository: RoleRepository,
    @inject(PermissionRepository)
    private _permissionRepository: PermissionRepository,
  ) {}

  async getRoles(): Promise<Role[]> {
    return this._roleRepository.findAll();
  }

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
   * Seeds default permissions for each role.
   * Only sets permissions if the role currently has none (preserves manual changes).
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
