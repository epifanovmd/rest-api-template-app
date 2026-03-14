import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { File } from "tsoa";
import { FindOptionsWhere } from "typeorm";

import { Injectable, logger } from "../../core";
import { FileService } from "../file";
import { IProfileUpdateRequestDto } from "./dto";
import { Profile } from "./profile.entity";
import { ProfileRepository } from "./profile.repository";

@Injectable()
export class ProfileService {
  constructor(
    @inject(FileService) private _fileService: FileService,
    @inject(ProfileRepository) private _profileRepository: ProfileRepository,
  ) {}

  async getProfiles(offset?: number, limit?: number) {
    const queryBuilder = this._profileRepository
      .createQueryBuilder("profile")
      .leftJoinAndSelect("profile.avatar", "avatar")
      .leftJoinAndSelect("profile.user", "user")
      .orderBy("profile.createdAt", "DESC");

    if (offset !== undefined) {
      queryBuilder.skip(offset);
    }

    if (limit !== undefined) {
      queryBuilder.take(limit);
    }

    return queryBuilder.getMany();
  }

  async getProfileByAttr(where: FindOptionsWhere<Profile>) {
    const profile = await this._profileRepository.findOne({
      where,
      relations: { avatar: true, user: true },
    });

    if (!profile) {
      throw new NotFoundException("Пользователь не найден");
    }

    return profile;
  }

  async getProfileByUserId(userId: string) {
    const profile = await this._profileRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException("Пользователь не найден");
    }

    return profile;
  }

  async updateProfile(userId: string, body: IProfileUpdateRequestDto) {
    await this._profileRepository.update({ userId }, body);
    const profile = await this._profileRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException("Пользователь не найден");
    }

    return profile;
  }

  async addAvatar(userId: string, file: File) {
    const profile = await this.getProfileByUserId(userId);
    const oldAvatarId = profile.avatarId;

    const uploadedFiles = await this._fileService.uploadFile([file]);
    const uploadedFile = uploadedFiles[0];

    await this._profileRepository.update({ userId }, { avatarId: uploadedFile.id });

    if (oldAvatarId) {
      this._fileService.deleteFile(oldAvatarId).catch(err =>
        logger.warn({ err, oldAvatarId }, "Failed to delete old avatar file"),
      );
    }

    return this.getProfileByUserId(userId);
  }

  async removeAvatar(userId: string) {
    const profile = await this.getProfileByUserId(userId);
    const oldAvatarId = profile.avatarId;

    await this._profileRepository.update({ userId }, { avatarId: null });

    if (oldAvatarId) {
      this._fileService.deleteFile(oldAvatarId).catch(err =>
        logger.warn({ err, oldAvatarId }, "Failed to delete avatar file"),
      );
    }

    return this.getProfileByUserId(userId);
  }

  async deleteProfile(userId: string) {
    const deleted = await this._profileRepository.delete({ userId });

    if (!deleted) {
      throw new NotFoundException("Профиль не найден");
    }

    return userId;
  }
}
