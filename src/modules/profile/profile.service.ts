import { NotFoundException } from "@force-dev/utils";
import { inject, injectable } from "inversify";
import { Includeable, WhereOptions } from "sequelize";
import { File } from "tsoa";

import { FileService } from "../file";
import { Files } from "../file/file.model";
import {
  IProfileUpdateRequest,
  Profile,
  ProfileCreateModel,
} from "./profile.model";

@injectable()
export class ProfileService {
  constructor(@inject(FileService) private _fileService: FileService) {}
  getProfiles = (offset?: number, limit?: number) =>
    Profile.findAll({
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: ProfileService.include,
    });

  getProfileByAttr = (where: WhereOptions<Profile>) =>
    Profile.findOne({
      where,
      include: ProfileService.include,
    }).then(result => {
      if (result === null) {
        return Promise.reject(new NotFoundException("Пользователь не найден"));
      }

      return result;
    });

  getProfileByUserId = (userId: string) =>
    Profile.findOne({
      where: {
        userId,
      },
      include: ProfileService.include,
    }).then(result => {
      if (result === null) {
        return Promise.reject(new NotFoundException("Пользователь не найден"));
      }

      return result;
    });

  createProfile = async (body: ProfileCreateModel) => {
    return Profile.create(body);
  };

  updateProfile = async (userId: string, body: IProfileUpdateRequest) => {
    await Profile.update(body, { where: { userId } });

    return this.getProfileByUserId(userId);
  };

  addAvatar = async (userId: string, file: File) => {
    const profile = await this.getProfileByUserId(userId);

    return this._fileService.uploadFile([file]).then(async uploadedFile => {
      if (profile.avatarId) {
        await this._fileService.deleteFile(profile.avatarId);
      }

      await profile.update({ avatarId: uploadedFile[0].id });

      return this.getProfileByUserId(userId);
    });
  };

  removeAvatar = async (userId: string) => {
    const profile = await this.getProfileByUserId(userId);

    if (profile.avatarId) {
      await this._fileService.deleteFile(profile.avatarId);
    }

    await profile.update({ avatarId: null });

    return this.getProfileByUserId(userId);
  };

  deleteProfile = async (userId: string) => {
    return Profile.destroy({ where: { userId } }).then(() => userId);
  };

  static get include(): Includeable[] {
    return [
      {
        model: Files,
        as: "avatar",
      },
    ];
  }
}
