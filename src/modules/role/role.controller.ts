import { inject } from "inversify";
import {
  Body,
  Controller,
  Get,
  Patch,
  Route,
  Security,
  Tags,
} from "tsoa";

import { Injectable, ValidateBody } from "../../core";
import { EPermissions } from "../permission/permission.types";
import { IRoleDto } from "./role.dto";
import { RoleService } from "./role.service";
import { SetRolePermissionsSchema } from "./validation";

export interface IRolePermissionsRequestDto {
  permissions: EPermissions[];
}

@Injectable()
@Tags("Role")
@Route("api/roles")
export class RoleController extends Controller {
  constructor(@inject(RoleService) private _roleService: RoleService) {
    super();
  }

  /**
   * Получить все роли с их правами.
   *
   * @summary Список ролей
   * @returns Список ролей
   */
  @Security("jwt", ["role:admin"])
  @Get()
  getRoles(): Promise<IRoleDto[]> {
    return this._roleService
      .getRoles()
      .then(roles => roles.map(r => r.toDTO()));
  }

  /**
   * Установить права для роли.
   * Заменяет текущий набор прав роли указанным.
   *
   * @summary Установка прав роли
   * @param id ID роли
   * @param body Список прав
   * @returns Обновлённая роль
   */
  @Security("jwt", ["role:admin"])
  @Patch("{id}/permissions")
  @ValidateBody(SetRolePermissionsSchema)
  setRolePermissions(
    id: string,
    @Body() body: IRolePermissionsRequestDto,
  ): Promise<IRoleDto> {
    return this._roleService
      .setRolePermissions(id, body.permissions)
      .then(r => r.toDTO());
  }
}
