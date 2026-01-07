import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { IFileDto } from "../../file/file.dto";
import { Profile } from "../profile.entity";
import { EProfileStatus } from "../profile.types";

export class ProfileDto extends BaseDto {
  id: string;
  firstName?: string;
  lastName?: string;
  birthDate?: Date | null;
  gender?: string;
  status?: string;
  lastOnline?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  avatar: IFileDto | null;

  constructor(entity: Profile) {
    super(entity);

    this.id = entity.id;
    this.firstName = entity.firstName;
    this.lastName = entity.lastName;
    this.birthDate = entity.birthDate;
    this.gender = entity.gender;
    this.status = entity.status;
    this.lastOnline = entity.lastOnline;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
    this.avatar = entity.avatar?.toDTO() || null;
  }

  static fromEntity(entity: Profile) {
    return new ProfileDto(entity);
  }
}

export class PublicProfileDto extends BaseDto {
  id: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  status: EProfileStatus;
  lastOnline?: Date;

  constructor(entity: Profile) {
    super(entity);

    this.id = entity.id;
    this.firstName = entity.firstName;
    this.lastName = entity.lastName;
    this.status = entity.status;
    this.lastOnline = entity.lastOnline;
    this.avatar = entity.avatar?.url || null;
  }

  static fromEntity(entity: Profile) {
    return new PublicProfileDto(entity);
  }
}

export interface IProfileListDto extends IListResponseDto<PublicProfileDto[]> {}
