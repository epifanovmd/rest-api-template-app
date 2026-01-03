import { NotFoundException } from "@force-dev/utils";
import { inject, injectable } from "inversify";
import { File } from "tsoa";
import { DataSource } from "typeorm";

import { Injectable } from "../../core";
import { FileService } from "../file";
import { FileRepository } from "../file/file.repository";
import { IProfileUpdateRequest } from "./profile.dto";
import { Profile } from "./profile.entity";
import { ProfileRepository } from "./profile.repository";

@Injectable()
export class ProfileService {
  constructor(
    @inject(FileService) private _fileService: FileService,
    @inject(ProfileRepository) private _profileRepository: ProfileRepository,
    @inject(FileRepository) private _fileRepository: FileRepository,
    @inject("DataSource") private _dataSource: DataSource,
  ) {}

  async getProfiles(offset?: number, limit?: number) {
    const queryBuilder = this._dataSource
      .getRepository("Profile")
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

    return profiles.map(profile => profile.toDTO());
  }

  async getProfileByAttr(where: any) {
    const queryBuilder = this._dataSource
      .getRepository("Profile")
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

  async createProfile(body: Partial<Profile>) {
    const profile = await this._profileRepository.create(body);

    return profile.toDTO();
  }

  async updateProfile(userId: string, body: IProfileUpdateRequest) {
    const profile = await this._profileRepository.update(userId, body);

    if (!profile) {
      throw new NotFoundException("Пользователь не найден");
    }

    return profile.toDTO();
  }

  async addAvatar(userId: string, file: File) {
    const queryRunner = this._dataSource.createQueryRunner();

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
      const updatedProfile = await this._profileRepository.update(userId, {
        avatarId: uploadedFile.id,
      });

      if (!updatedProfile) {
        throw new NotFoundException("Не удалось обновить профиль");
      }

      await queryRunner.commitTransaction();

      return updatedProfile.toDTO();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async removeAvatar(userId: string) {
    const queryRunner = this._dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const profile = await this.getProfileByUserId(userId);

      if (profile.avatarId) {
        await this._fileService.deleteFile(profile.avatarId);
      }

      const updatedProfile = await this._profileRepository.update(userId, {
        avatarId: null,
      });

      if (!updatedProfile) {
        throw new NotFoundException("Не удалось обновить профиль");
      }

      await queryRunner.commitTransaction();

      return updatedProfile.toDTO();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteProfile(userId: string) {
    const deleted = await this._profileRepository.delete(userId);

    if (!deleted) {
      throw new NotFoundException("Профиль не найден");
    }

    return userId;
  }
}
