import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { FindOptionsWhere } from "typeorm";

import { Injectable } from "../../core";
import { IProfileUpdateRequestDto } from "./dto";
import { Profile } from "./profile.entity";
import { ProfileRepository } from "./profile.repository";

@Injectable()
export class ProfileService {
  constructor(
    @inject(ProfileRepository) private _profileRepository: ProfileRepository,
  ) {}

  async getProfiles(offset?: number, limit?: number) {
    const queryBuilder = this._profileRepository
      .createQueryBuilder("profile")
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
      relations: { user: true },
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

  async deleteProfile(userId: string) {
    const deleted = await this._profileRepository.delete({ userId });

    if (!deleted) {
      throw new NotFoundException("Профиль не найден");
    }

    return userId;
  }
}
