// user.service.ts (переписанный под TypeORM)
import { ConflictException, NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import sha256 from "sha256";
import { FindOptionsWhere } from "typeorm";

import { IApiResponseDto, Injectable } from "../../core";
import { MailerService } from "../mailer";
import { OtpService } from "../otp";
import { EPermissions } from "../permission/permission.entity";
import { PermissionRepository } from "../permission/permission.repository";
import { ProfileRepository } from "../profile/profile.repository";
import { ERole } from "../role/role.entity";
import { RoleRepository } from "../role/role.repository";
import { IUserPrivilegesRequestDto, IUserUpdateRequestDto } from "./user.dto";
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

  async getUsers(offset?: number, limit?: number) {
    const users = await this._userRepository.findAll(
      offset,
      limit,
      UserService.relations,
    );

    return users.map(user => user.toDTO());
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
    const queryRunner = this._userRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Создаем пользователя
      const user = await this._userRepository.createAndSave({
        ...body,
      });

      // Создаем пустой профиль
      await this._profileRepository.createAndSave({
        userId: user.id,
        status: "offline",
      });

      await queryRunner.commitTransaction();

      // Устанавливаем роль по умолчанию
      return this.setPrivileges(user.id, ERole.USER, []);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createAdmin(body: Partial<User>) {
    // Проверяем, существует ли пользователь
    const existingUser = await this._userRepository.findByEmailOrPhone(
      body.email,
      body.phone,
    );

    if (existingUser) {
      throw new ConflictException("Пользователь уже существует");
    }

    const user = await this.createUser(body);

    await this.setPrivileges(user.id, ERole.ADMIN, []);

    // Если пользователь существует, возвращаем его с ролью ADMIN
    const existingUser1 = await this._userRepository.findByEmailOrPhone(
      body.email,
      body.phone,
    );

    if (existingUser1) {
      return this.setPrivileges(existingUser1.id, ERole.ADMIN, []);
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

  async setPermissions(
    roleId: string,
    permissions: EPermissions[],
  ): Promise<void> {
    const role = await this._roleRepository.findById(roleId);

    if (!role) {
      throw new Error("Role not found");
    }

    // Находим или создаем разрешения
    role.permissions = await Promise.all(
      permissions.map(async permissionName => {
        let permission = await this.permissionRepository.findByName(
          permissionName,
        );

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

  async setPrivileges(
    userId: string,
    roleName: IUserPrivilegesRequestDto["roleName"],
    permissions: IUserPrivilegesRequestDto["permissions"] = [],
  ) {
    const queryRunner = this._userRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await this._userRepository.findById(userId);

      if (!user) {
        throw new NotFoundException("Пользователь не найден");
      }

      // Находим или создаем роль
      let role = await this._roleRepository.findByName(roleName);

      if (!role) {
        role = this._roleRepository.create({
          name: roleName,
        });
      }

      // Устанавливаем роль пользователю
      user.role = role;
      user.roleId = role.id;
      await this._userRepository.save(user);

      // Если есть разрешения, устанавливаем их для роли
      if (permissions.length > 0) {
        await this.setPermissions(role.id, permissions);
      }

      await queryRunner.commitTransaction();

      // Возвращаем обновленного пользователя с отношениями
      return this.getUser(userId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async requestVerifyEmail(userId: string, email?: string) {
    const user = await this.getUser(userId);

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
      user.emailVerified = true;
      await this._userRepository.save(user);
    }

    return new IApiResponseDto({
      message: "Email успешно подтвержден.",
      data: {},
    });
  }

  async changePassword(userId: string, password: string) {
    const user = await this.getUser(userId);

    user.passwordHash = sha256(password);

    await this._userRepository.save(user);

    return new IApiResponseDto({ message: "Пароль успешно изменен." });
  }

  async deleteUser(userId: string) {
    const deleted = await this._userRepository.delete(userId);

    if (!deleted) {
      throw new NotFoundException("Пользователь не найден");
    }

    return userId;
  }

  // Статические методы для отношений
  static get relations() {
    return {
      role: {
        permissions: true,
      },
    };
  }
}
