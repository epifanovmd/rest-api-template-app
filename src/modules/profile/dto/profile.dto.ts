import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { UserDto } from "../../user/dto";
import { Profile } from "../profile.entity";
import { EProfileStatus } from "../profile.types";

export class ProfileDto extends BaseDto {
  id: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  birthDate?: Date | null;
  gender?: string;
  status?: string;
  lastOnline?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  user?: UserDto;

  constructor(entity: Profile) {
    super(entity);

    this.id = entity.id;
    this.userId = entity.userId;
    this.firstName = entity.firstName;
    this.lastName = entity.lastName;
    this.birthDate = entity.birthDate;
    this.gender = entity.gender;
    this.status = entity.status;
    this.lastOnline = entity.lastOnline;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;

    this.user = entity.user;
  }

  static fromEntity(entity: Profile) {
    return new ProfileDto(entity);
  }
}

export class PublicProfileDto extends BaseDto {
  id: string;
  firstName?: string;
  lastName?: string;
  status: EProfileStatus;
  lastOnline?: Date;

  constructor(entity: Profile) {
    super(entity);

    this.id = entity.id;
    this.firstName = entity.firstName;
    this.lastName = entity.lastName;
    this.status = entity.status;
    this.lastOnline = entity.lastOnline;
  }

  static fromEntity(entity: Profile) {
    return new PublicProfileDto(entity);
  }
}

export interface IProfileListDto extends IListResponseDto<PublicProfileDto[]> {}
