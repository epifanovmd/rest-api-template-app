import { IListResponseDto } from "../../../core";
import { BaseDto } from "../../../core/dto/BaseDto";
import { IPermissionDto } from "../../permission/permission.dto";
import { ProfileDto, PublicProfileDto } from "../../profile/dto";
import { IRoleDto } from "../../role/role.dto";
import { User } from "../user.entity";

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

  constructor(entity: User) {
    super(entity);

    this.id = entity.id;
    this.email = entity.email;
    this.emailVerified = entity.emailVerified;
    this.phone = entity.phone;
    this.username = entity.username;
    this.profile = entity.profile && ProfileDto.fromEntity(entity.profile);
    this.roles = entity.roles?.map(r => r.toDTO()) ?? [];
    this.directPermissions = entity.directPermissions?.map(p => p.toDTO()) ?? [];
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }

  static fromEntity(entity: User) {
    return new UserDto(entity);
  }
}

export class PublicUserDto extends BaseDto {
  userId: string;
  email: string | null;
  username: string | null;
  profile: PublicProfileDto;

  constructor(entity: User) {
    super(entity);

    this.userId = entity.id;
    this.email = entity.email;
    this.username = entity.username;
    this.profile = PublicProfileDto.fromEntity(entity.profile);
  }

  static fromEntity(entity: User) {
    return new PublicUserDto(entity);
  }
}

export interface IUserListDto extends IListResponseDto<PublicUserDto[]> {}

export interface IUserOptionDto {
  id: string;
  name: string | null;
}

export interface IUserOptionsDto {
  data: IUserOptionDto[];
}
