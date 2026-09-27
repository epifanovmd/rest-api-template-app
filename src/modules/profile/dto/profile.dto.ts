import { IPaginatedDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import {
  IFileDto,
  signedFileOf,
  signedUrlOf,
  TFileRef,
  TSignedFiles,
} from "../../file";
import { UserDto } from "../../user/dto";
import { Profile } from "../profile.entity";

/** Аватары профилей — для подписи пачкой (`FileUrlService.toDtoMap`) перед сборкой DTO. */
export const collectProfileFiles = (
  profiles: ReadonlyArray<Profile | null | undefined>,
): TFileRef[] => profiles.map(profile => profile?.avatar);

/** Профиль владельца; ссылки на аватар — из карты подписей `files`. */
export class ProfileDto extends BaseDto {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: Date | null;
  gender: string | null;
  locale: string | null;
  lastOnline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Аватар с подписанными ссылками; нет аватара или связь не загружена — поля нет. */
  avatar?: IFileDto;

  user?: UserDto;

  constructor(entity: Profile, files: TSignedFiles) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.firstName = entity.firstName;
    this.lastName = entity.lastName;
    this.birthDate = entity.birthDate;
    this.gender = entity.gender;
    this.locale = entity.locale ?? null;
    this.lastOnline = entity.lastOnline;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.avatar = signedFileOf(entity.avatar, files);

    this.user = entity.user
      ? UserDto.fromEntity(entity.user, files)
      : undefined;
  }

  static fromEntity(entity: Profile, files: TSignedFiles) {
    return new ProfileDto(entity, files);
  }
}

/** Профиль глазами другого пользователя; ссылка на аватар — из карты подписей. */
export class PublicProfileDto extends BaseDto {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  lastOnline: Date | null;
  /** Подписанная ссылка на аватар; срок ограничен. `null` — аватара нет. */
  avatarUrl: string | null;

  constructor(entity: Profile, files: TSignedFiles) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.firstName = entity.firstName;
    this.lastName = entity.lastName;
    this.lastOnline = entity.lastOnline;
    this.avatarUrl = signedUrlOf(entity.avatar, files);
  }

  static fromEntity(entity: Profile, files: TSignedFiles) {
    return new PublicProfileDto(entity, files);
  }
}

export interface IProfileListDto extends IPaginatedDto<PublicProfileDto> {}
