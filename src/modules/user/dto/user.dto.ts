import { IPaginatedDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { NO_SIGNED_FILES, TFileRef, TSignedFiles } from "../../file";
import { IPermissionDto } from "../../permission/permission.dto";
import {
  collectProfileFiles,
  ProfileDto,
  PublicProfileDto,
} from "../../profile/dto";
import { IRoleDto } from "../../role/role.dto";
import { User } from "../user.entity";

/** Аватары пользователей — для подписи пачкой перед сборкой `UserDto`/`PublicUserDto`. */
export const collectUserFiles = (
  users: ReadonlyArray<User | null | undefined>,
): TFileRef[] => collectProfileFiles(users.map(user => user?.profile));

/** Пользователь для владельца и администрирования; аватар — из карты подписей. */
export class UserDto extends BaseDto {
  id: string;
  email: string | null;
  emailVerified?: boolean;
  phone: string | null;
  username: string | null;
  profile?: ProfileDto;
  roles: IRoleDto[];
  directPermissions: IPermissionDto[];
  createdAt: Date;
  updatedAt: Date;

  constructor(entity: User, files: TSignedFiles) {
    super(entity);

    this.id = entity.id;
    this.email = entity.email;
    this.emailVerified = entity.emailVerified;
    this.phone = entity.phone;
    this.username = entity.username;
    this.profile =
      entity.profile && ProfileDto.fromEntity(entity.profile, files);
    this.roles = entity.roles?.map(r => r.toDTO()) ?? [];
    this.directPermissions =
      entity.directPermissions?.map(p => p.toDTO()) ?? [];
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }

  /** Без `files` аватар не отдаётся: ссылки подписывает только `FileUrlService`. */
  static fromEntity(entity: User, files: TSignedFiles = NO_SIGNED_FILES) {
    return new UserDto(entity, files);
  }
}

export interface IPublicUserDtoOptions {
  /** Телефон виден зрителю по настройке приватности `showPhone`. */
  showPhone?: boolean;
}

/** Пользователь глазами другого пользователя: без email, телефон — по приватности. */
export class PublicUserDto extends BaseDto {
  userId: string;
  username: string | null;
  phone: string | null;
  profile?: PublicProfileDto;

  constructor(
    entity: User,
    files: TSignedFiles,
    options: IPublicUserDtoOptions = {},
  ) {
    super(entity);

    this.userId = entity.id;
    this.username = entity.username;
    this.phone = options.showPhone ? entity.phone : null;
    this.profile =
      entity.profile && PublicProfileDto.fromEntity(entity.profile, files);
  }

  static fromEntity(
    entity: User,
    files: TSignedFiles,
    options?: IPublicUserDtoOptions,
  ) {
    return new PublicUserDto(entity, files, options);
  }
}

export interface IUserListDto extends IPaginatedDto<PublicUserDto> {}

/** Список пользователей для администрирования (`user:view`). */
export interface IUserAdminListDto extends IPaginatedDto<UserDto> {}

export interface IUserOptionDto {
  id: string;
  name: string | null;
}

export interface IUserOptionsDto {
  data: IUserOptionDto[];
}
