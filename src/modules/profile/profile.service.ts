import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { FindOptionsWhere } from "typeorm";

import { EventBus, Injectable } from "../../core";
import { PublicProfileDto } from "./dto";
import { IProfileUpdateRequestDto } from "./dto";
import { ProfileUpdatedEvent } from "./events";
import { Profile } from "./profile.entity";
import { ProfileRepository } from "./profile.repository";

/** Сервис для управления профилями пользователей. */
@Injectable()
export class ProfileService {
  constructor(
    @inject(ProfileRepository) private _profileRepository: ProfileRepository,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  /** Получить список всех профилей с пагинацией, отсортированный по дате создания по убыванию. */
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

    return queryBuilder.getManyAndCount();
  }

  /** Найти профиль по произвольным условиям; выбрасывает NotFoundException если не найден. */
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

  /** Получить профиль по идентификатору пользователя; выбрасывает NotFoundException если не найден. */
  async getProfileByUserId(userId: string) {
    const profile = await this._profileRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException("Пользователь не найден");
    }

    return profile;
  }

  /** Обновить профиль пользователя и вернуть обновлённые данные. */
  async updateProfile(userId: string, body: IProfileUpdateRequestDto) {
    await this._profileRepository.update({ userId }, body);
    const profile = await this._profileRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException("Пользователь не найден");
    }

    this._eventBus.emit(
      new ProfileUpdatedEvent(PublicProfileDto.fromEntity(profile)),
    );

    return profile;
  }

  /** Удалить профиль пользователя; выбрасывает NotFoundException если не найден. */
  async deleteProfile(userId: string) {
    const deleted = await this._profileRepository.delete({ userId });

    if (deleted.affected === 0) {
      throw new NotFoundException("Профиль не найден");
    }

    return userId;
  }
}
