import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { IFileDto } from "../../file/file.dto";
import { UserDto } from "../../user/dto";
import { Profile } from "../profile.entity";

export class ProfileDto extends BaseDto {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: Date | null;
  gender: string | null;
  lastOnline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  avatar?: IFileDto;

  user?: UserDto;

  constructor(entity: Profile) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.firstName = entity.firstName;
    this.lastName = entity.lastName;
    this.birthDate = entity.birthDate;
    this.gender = entity.gender;
    this.lastOnline = entity.lastOnline;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.avatar = entity.avatar?.toDTO();

    this.user = entity.user ? UserDto.fromEntity(entity.user) : undefined;
  }

  static fromEntity(entity: Profile) {
    return new ProfileDto(entity);
  }
}

export class PublicProfileDto extends BaseDto {
  id: string;
  firstName: string | null;
  lastName: string | null;
  lastOnline: Date | null;

  constructor(entity: Profile) {
    super(entity);

    this.id = entity.id;
    this.firstName = entity.firstName;
    this.lastName = entity.lastName;
    this.lastOnline = entity.lastOnline;
  }

  static fromEntity(entity: Profile) {
    return new PublicProfileDto(entity);
  }
}

export interface IProfileListDto extends IListResponseDto<PublicProfileDto[]> {}
