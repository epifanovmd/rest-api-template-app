import { inject } from "inversify";
import { FindOptionsWhere } from "typeorm";

import {
  EventBus,
  Injectable,
  IPaginatedDto,
  normalizePagination,
  toPage,
} from "../../core";
import { EFileStatus, FileRepository, FileUrlService } from "../file";
import {
  collectProfileFiles,
  IProfileUpdateRequestDto,
  ProfileDto,
  PublicProfileDto,
} from "./dto";
import { ProfileUpdatedEvent } from "./events";
import { Profile } from "./profile.entity";
import { ProfileError } from "./profile.errors";
import { ProfileRepository } from "./profile.repository";

/** Сервис для управления профилями пользователей. */
@Injectable()
export class ProfileService {
  constructor(
    @inject(ProfileRepository) private _profileRepository: ProfileRepository,
    @inject(EventBus) private _eventBus: EventBus,
    @inject(FileUrlService) private _fileUrls: FileUrlService,
    @inject(FileRepository) private _files: FileRepository,
  ) {}

  /**
   * Аватаром может быть только своё изображение, загрузка которого
   * подтверждена (обработка может ещё идти — превью появится позже).
   */
  private async _assertAvatar(userId: string, fileId: string): Promise<void> {
    const file = await this._files.findById(fileId);
    const usable =
      !!file &&
      file.ownerId === userId &&
      file.type.startsWith("image/") &&
      file.status !== EFileStatus.Pending &&
      file.status !== EFileStatus.Failed;

    if (!usable) throw ProfileError.AVATAR_INVALID();
  }

  /** `ProfileDto` владельца с подписанным аватаром. */
  toProfileDto(profile: Profile): Promise<ProfileDto> {
    return this._fileUrls.buildOneWithFiles(
      profile,
      collectProfileFiles,
      ProfileDto.fromEntity,
    );
  }

  /** `PublicProfileDto` с подписанным аватаром. */
  toPublicProfileDto(profile: Profile): Promise<PublicProfileDto> {
    return this._fileUrls.buildOneWithFiles(
      profile,
      collectProfileFiles,
      PublicProfileDto.fromEntity,
    );
  }

  /** Страница профилей, новые первыми; лимит по умолчанию и максимум — из `core`. */
  async getProfiles(
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<PublicProfileDto>> {
    const page = normalizePagination(offset, limit);
    const [items, total] = await this._profileRepository.findPage(page);

    const dtos = await this._fileUrls.buildWithFiles(
      items,
      collectProfileFiles,
      PublicProfileDto.fromEntity,
    );

    return toPage(dtos, total, page);
  }

  /** Найти профиль по произвольным условиям; иначе `PROFILE_NOT_FOUND`. */
  async getProfileByAttr(where: FindOptionsWhere<Profile>) {
    const profile = await this._profileRepository.findOne({
      where,
      relations: { user: true },
    });

    if (!profile) {
      throw ProfileError.NOT_FOUND();
    }

    return profile;
  }

  /** Получить профиль по идентификатору пользователя; иначе `PROFILE_NOT_FOUND`. */
  async getProfileByUserId(userId: string) {
    const profile = await this._profileRepository.findByUserId(userId);

    if (!profile) {
      throw ProfileError.NOT_FOUND();
    }

    return profile;
  }

  /** Обновить профиль пользователя и вернуть обновлённые данные. */
  async updateProfile(userId: string, body: IProfileUpdateRequestDto) {
    if (body.avatarId) await this._assertAvatar(userId, body.avatarId);

    await this._profileRepository.update({ userId }, body);
    const profile = await this._profileRepository.findByUserId(userId);

    if (!profile) {
      throw ProfileError.NOT_FOUND();
    }

    this._eventBus.emit(
      new ProfileUpdatedEvent(await this.toPublicProfileDto(profile)),
    );

    return profile;
  }

  /**
   * «Удалить» профиль: очистить личные данные. Запись остаётся — профиль
   * существует у пользователя всегда (1:1 с `users`).
   */
  async deleteProfile(userId: string): Promise<void> {
    const cleared = await this._profileRepository.update(
      { userId },
      {
        firstName: null,
        lastName: null,
        birthDate: null,
        gender: null,
        avatarId: null,
      },
    );

    if (!cleared.affected) {
      throw ProfileError.NOT_FOUND();
    }

    const profile = await this._profileRepository.findByUserId(userId);

    if (profile) {
      this._eventBus.emit(
        new ProfileUpdatedEvent(await this.toPublicProfileDto(profile)),
      );
    }
  }
}
