import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { ProfileDto, PublicProfileDto } from "../../profile/dto";
import { IRoleDto } from "../../role/role.dto";
import { User } from "../user.entity";

export class UserDto extends BaseDto {
  id: string;
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  challenge?: string | null;
  profile?: ProfileDto;
  role: IRoleDto;
  createdAt: Date;
  updatedAt: Date;

  constructor(entity: User) {
    super(entity);

    this.id = entity.id;
    this.email = entity.email;
    this.emailVerified = entity.emailVerified;
    this.phone = entity.phone;
    this.profile = entity.profile && ProfileDto.fromEntity(entity.profile);
    this.challenge = entity.challenge;
    this.role = entity.role?.toDTO();
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }

  static fromEntity(entity: User) {
    return new UserDto(entity);
  }
}

export class PublicUserDto extends BaseDto {
  userId: string;
  email: string;
  profile: PublicProfileDto;

  constructor(entity: User) {
    super(entity);

    this.userId = entity.id;
    this.email = entity.email;
    this.profile = PublicProfileDto.fromEntity(entity.profile);
  }

  static fromEntity(entity: User) {
    return new PublicUserDto(entity);
  }
}

export interface IUserListDto extends IListResponseDto<PublicUserDto[]> {}
