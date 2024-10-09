import { NotFoundException } from "@force-dev/utils";
import { injectable } from "inversify";
import { Includeable, WhereOptions } from "sequelize";

import { EPermissions, Permission } from "../permission";
import { ERole, Role } from "../role";
import {
  IProfileUpdateRequest,
  Profile,
  ProfileModel,
  TProfileCreateModel,
} from "./profile.model";

@injectable()
export class ProfileService {
  getAllProfile = (offset?: number, limit?: number) =>
    Profile.findAll({
      limit,
      offset,
      attributes: ProfileService.profileAttributes,
      order: [["createdAt", "DESC"]],
      include: ProfileService.include,
    });

  getProfileByAttr = (where: WhereOptions) =>
    Profile.findOne({
      where,
      include: ProfileService.include,
    }).then(result => {
      if (result === null) {
        return Promise.reject(
          new NotFoundException("Профиль пользователя не найден"),
        );
      }

      return result;
    });

  getProfile = (id: string) =>
    Profile.findByPk(id, {
      attributes: ProfileService.profileAttributes,
      include: ProfileService.include,
    }).then(result => {
      if (result === null) {
        return Promise.reject(
          new NotFoundException("Профиль пользователя не найден"),
        );
      }

      return result;
    });

  createProfile = (body: TProfileCreateModel) => {
    return Profile.create(body).then(result => {
      return this.setPrivilegesToUser(result.id, ERole.USER, [
        EPermissions.READ,
        EPermissions.WRITE,
      ]);
    });
  };

  updateProfile = (id: string, body: IProfileUpdateRequest) =>
    Profile.update(body, { where: { id } }).then(() => this.getProfile(id));

  setPrivilegesToUser = async (
    profileId: string,
    roleName: ERole,
    permissions: EPermissions[],
  ) => {
    const profile = await Profile.findByPk(profileId);

    if (!profile) {
      return Promise.reject(
        new NotFoundException("Профиль пользователя не найден"),
      );
    }

    const [role, success] = await Role.findOrCreate({
      where: { name: roleName },
    });

    if (success && role) {
      await profile.setRole(role);

      const permissionInstances = await Promise.all(
        permissions.map(permissionName =>
          Permission.findOrCreate({ where: { name: permissionName } }).then(
            ([permission]) => permission,
          ),
        ),
      );

      await role.setPermissions(permissionInstances);
    }

    return this.getProfile(profileId);
  };

  deleteProfile = async (profileId: string) => {
    return Profile.destroy({ where: { id: profileId } }).then(() => profileId);
  };

  static get profileAttributes(): (keyof ProfileModel)[] {
    return [
      "id",
      "phone",
      "email",
      "firstName",
      "lastName",
      "username",
      "createdAt",
      "updatedAt",
    ];
  }

  static get include(): Includeable[] {
    return [
      {
        model: Role,
        // attributes: { exclude: ["createdAt", "updatedAt"] },
        include: [
          {
            model: Permission,
            // attributes: { exclude: ["createdAt", "updatedAt"] },
            through: {
              attributes: [], // Исключаем атрибуты связывающей таблицы
            },
          },
        ],
      },
    ];
  }
}
