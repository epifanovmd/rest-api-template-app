import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Route,
  Security,
  Tags,
} from "tsoa";

import { Injectable, ValidateBody } from "../../core";
import { TPermission } from "../permission/permission.types";
import { IRoleDto } from "./role.dto";
import { RoleService } from "./role.service";
import { TRole } from "./role.types";
import { SetRolePermissionsSchema } from "./validation";
import { CreateRoleSchema } from "./validation/create-role.validate";

interface IRolePermissionsRequestDto {
  permissions: TPermission[];
}

interface ICreateRoleRequestDto {
  name: TRole;
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
  @Security("jwt", ["permission:role:view"])
  @Get()
  getRoles(): Promise<IRoleDto[]> {
    return this._roleService
      .getRoles()
      .then(roles => roles.map(r => r.toDTO()));
  }

  /**
   * Создать новую роль.
   *
   * @summary Создание роли
   * @param body Название роли
   * @returns Созданная роль
   */
  @Security("jwt", ["permission:role:manage"])
  @Post()
  @ValidateBody(CreateRoleSchema)
  async createRole(@Body() body: ICreateRoleRequestDto): Promise<IRoleDto> {
    const role = await this._roleService.createRole(body.name);

    return role.toDTO();
  }

  /**
   * Удалить роль.
   *
   * @summary Удаление роли
   * @param id ID роли
   */
  @Security("jwt", ["permission:role:manage"])
  @Delete("{id}")
  async deleteRole(@Path() id: string): Promise<void> {
    await this._roleService.deleteRole(id);
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
  @Security("jwt", ["permission:role:manage"])
  @Patch("{id}/permissions")
  @ValidateBody(SetRolePermissionsSchema)
  setRolePermissions(
    @Path() id: string,
    @Body() body: IRolePermissionsRequestDto,
  ): Promise<IRoleDto> {
    return this._roleService
      .setRolePermissions(id, body.permissions)
      .then(r => r.toDTO());
  }
}
