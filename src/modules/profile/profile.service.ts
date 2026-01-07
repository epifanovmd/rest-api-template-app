import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { File } from "tsoa";

import { Injectable } from "../../core";
import { FileService } from "../file";
import { IProfileUpdateRequestDto } from "./dto";
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

    const profiles = await queryBuilder.getMany();

    return profiles.map(profile => profile);
  }

  async getProfileByAttr(where: any) {
    const queryBuilder = this._profileRepository
      .createQueryBuilder("profile")
      .leftJoinAndSelect("profile.avatar", "avatar")
      .leftJoinAndSelect("profile.user", "user");

    // Добавляем условия where
    Object.keys(where).forEach((key, index) => {
      if (index === 0) {
        queryBuilder.where(`profile.${key} = :${key}`, { [key]: where[key] });
      } else {
        queryBuilder.andWhere(`profile.${key} = :${key}`, {
          [key]: where[key],
        });
      }
    });

    const profile = await queryBuilder.getOne();

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
    const queryRunner = this._profileRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const profile = await this.getProfileByUserId(userId);

      // Загружаем файл
      const uploadedFiles = await this._fileService.uploadFile([file]);
      const uploadedFile = uploadedFiles[0];

      // Удаляем старый аватар если есть
      if (profile.avatarId) {
        await this._fileService.deleteFile(profile.avatarId);
      }

      // Обновляем профиль с новым аватаром
      await this._profileRepository.update(
        { userId },
        {
          avatarId: uploadedFile.id,
        },
      );

      await queryRunner.commitTransaction();

      return this.getProfileByUserId(userId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async removeAvatar(userId: string) {
    const queryRunner = this._profileRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const profile = await this.getProfileByUserId(userId);

      if (profile.avatarId) {
        await this._fileService.deleteFile(profile.avatarId);
      }

      await this._profileRepository.update(userId, {
        avatarId: null,
      });

      await queryRunner.commitTransaction();

      return this.getProfileByUserId(userId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteProfile(userId: string) {
    const deleted = await this._profileRepository.delete({ userId });

    if (!deleted) {
      throw new NotFoundException("Профиль не найден");
    }

    return userId;
  }
}
