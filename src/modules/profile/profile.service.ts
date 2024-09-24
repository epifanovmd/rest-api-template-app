import { injectable } from "inversify";
import { Includeable, WhereOptions } from "sequelize";

import { NotFoundException } from "../../common";
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
    return Profile.create(body).then(result => this.getProfile(result.id));
  };

  updateProfile = (id: string, body: IProfileUpdateRequest) =>
    Profile.update(body, { where: { id } }).then(() => this.getProfile(id));

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
    return [];
  }
}