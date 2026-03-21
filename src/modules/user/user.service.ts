import { ConflictException, NotFoundException } from "@force-dev/utils";
import bcrypt from "bcrypt";
import { inject } from "inversify";
import { FindOptionsRelations, FindOptionsWhere, ILike } from "typeorm";

import { ApiResponseDto, Injectable } from "../../core";
import { MailerService } from "../mailer";
import { OtpService } from "../otp";
import { PermissionRepository } from "../permission";
import { EPermissions } from "../permission/permission.types";
import { ProfileRepository } from "../profile";
import { EProfileStatus } from "../profile/profile.types";
import { RoleRepository } from "../role";
import { ERole } from "../role/role.types";
import {
  IUserOptionDto,
  IUserPrivilegesRequestDto,
  IUserUpdateRequestDto,
} from "./dto";
import { User } from "./user.entity";
import { UserRepository } from "./user.repository";

@Injectable()
export class UserService {
  constructor(
    @inject(MailerService) private _mailerService: MailerService,
    @inject(OtpService) private _otpService: OtpService,
    @inject(UserRepository) private _userRepository: UserRepository,
    @inject(RoleRepository) private _roleRepository: RoleRepository,
    @inject(PermissionRepository)
    private permissionRepository: PermissionRepository,
    @inject(ProfileRepository) private _profileRepository: ProfileRepository,
  ) {}

  async getUsers(offset?: number, limit?: number, query?: string) {
    return this._userRepository.findAndCount({
      where: query ? [{ email: ILike(`%${query}%`) }] : undefined,
      skip: offset,
      take: limit,
      order: { createdAt: "DESC" },
    });
  }

  async getOptions(query?: string): Promise<IUserOptionDto[]> {
    return this._userRepository.findOptions(query);
  }

  async getUserByAttr(where: FindOptionsWhere<User>) {
    const user = await this._userRepository.findByEmailOrPhone(
      where.email as string,
      where.phone as string,
      UserService.relations,
    );

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    return user;
  }

  async getUser(id: string) {
    const user = await this._userRepository.findOne({
      where: { id },
      relations: UserService.relations,
    });

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    return user;
  }

  async createUser(body: Partial<User>) {
    const user = await this._userRepository.createAndSave({ ...body });

    await this._profileRepository.createAndSave({
      userId: user.id,
      status: EProfileStatus.Offline,
    });

    return this.setPrivileges(user.id, {
      roles: [ERole.USER],
      permissions: [],
    });
  }

  async createAdmin(body: Partial<User>) {
    const existingUser = await this._userRepository.findByEmailOrPhone(
      body.email,
      body.phone,
    );

    if (existingUser) {
      throw new ConflictException("Пользователь уже существует");
    }

    const user = await this.createUser(body);

    if (user) {
      return this.setPrivileges(user.id, {
        roles: [ERole.ADMIN],
        permissions: [],
      });
    }

    throw new NotFoundException("Пользователь не найден");
  }

  async updateUser(id: string, body: IUserUpdateRequestDto) {
    const user = await this._userRepository.updateWithResponse(id, body);

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    return user;
  }

  async setChallenge(id: string, challenge: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._userRepository.update(id, { challenge: challenge as any });
  }

  /**
   * Assigns roles and direct permissions to a user.
   *
   * - Replaces all current roles with the provided list.
   * - Replaces all current direct permissions with the provided list.
   * - Role-level permissions are managed separately via setRolePermissions().
   *
   * Effective permissions in the JWT = union(role.permissions) ∪ permissions.
   */
  async setPrivileges(
    userId: string,
    body: IUserPrivilegesRequestDto,
  ): Promise<User> {
    const user = await this._userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    // Assign roles (find or create each)
    user.roles = await Promise.all(
      body.roles.map(async roleName => {
        let role = await this._roleRepository.findByName(roleName);

        if (!role) {
          role = await this._roleRepository.createAndSave({ name: roleName });
        }

        return role;
      }),
    );

    // Assign direct permissions (find or create each)
    user.directPermissions = await Promise.all(
      body.permissions.map(async permName => {
        let perm = await this.permissionRepository.findByName(permName);

        if (!perm) {
          perm = await this.permissionRepository.createAndSave({
            name: permName,
          });
        }

        return perm;
      }),
    );

    await this._userRepository.save(user);

    return this.getUser(userId);
  }

  /**
   * Sets the permissions for a role (shared across all users with that role).
   * Use this to configure the permission template for a role.
   */
  async setRolePermissions(
    roleId: string,
    permissions: EPermissions[],
  ): Promise<void> {
    const role = await this._roleRepository.findById(roleId);

    if (!role) {
      throw new NotFoundException("Роль не найдена");
    }

    role.permissions = await Promise.all(
      permissions.map(async permissionName => {
        let permission =
          await this.permissionRepository.findByName(permissionName);

        if (!permission) {
          permission = await this.permissionRepository.createAndSave({
            name: permissionName,
          });
        }

        return permission;
      }),
    );

    await this._roleRepository.save(role);
  }

  async requestVerifyEmail(userId: string) {
    const user = await this.getUser(userId);
    const email = user.email;

    if (user.emailVerified) {
      throw new ConflictException("Email уже подтвержден.");
    }

    if (!email) {
      throw new NotFoundException("У пользователя отсутствует email.");
    }

    const otp = await this._otpService.create(userId);

    await this._mailerService.sendCodeMail(email, otp.code);

    return !!otp.code;
  }

  async verifyEmail(userId: string, code: string) {
    const user = await this.getUser(userId);

    if (user.emailVerified) {
      throw new ConflictException("Email уже подтвержден.");
    }

    if (await this._otpService.check(userId, code)) {
      await this._userRepository.update(userId, { emailVerified: true });
    }

    return new ApiResponseDto({
      message: "Email успешно подтвержден.",
    });
  }

  async changePassword(userId: string, password: string) {
    await this._userRepository.update(userId, {
      passwordHash: await bcrypt.hash(password, 12),
    });

    return new ApiResponseDto({ message: "Пароль успешно изменен." });
  }

  async deleteUser(userId: string) {
    const deleted = await this._userRepository.delete(userId);

    return !!deleted.affected;
  }

  static get relations(): FindOptionsRelations<User> {
    return {
      profile: true,
      roles: {
        permissions: true,
      },
      directPermissions: true,
    };
  }
}
