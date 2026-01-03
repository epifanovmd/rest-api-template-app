// user.service.ts (переписанный под TypeORM)
import { ConflictException, NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import sha256 from "sha256";
import { DataSource, FindOptionsWhere } from "typeorm";

import { ApiResponse, Injectable } from "../../core";
import { MailerService } from "../mailer";
import { OtpService } from "../otp";
import { ProfileRepository } from "../profile/profile.repository";
import { ERole } from "../role/role.entity";
import { RoleRepository } from "../role/role.repository";
import { IUserPrivilegesRequest, IUserUpdateRequest } from "./user.dto";
import { User } from "./user.entity";
import { UserRepository } from "./user.repository";

@Injectable()
export class UserService {
  constructor(
    @inject(MailerService) private _mailerService: MailerService,
    @inject(OtpService) private _otpService: OtpService,
    @inject(UserRepository) private _userRepository: UserRepository,
    @inject(RoleRepository) private _roleRepository: RoleRepository,
    @inject(ProfileRepository) private _profileRepository: ProfileRepository,
    @inject("DataSource") private _dataSource: DataSource,
  ) {}

  async getUsers(offset?: number, limit?: number) {
    const [users, total] = await this._userRepository.findAll(
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
    const user = await this._userRepository.findById(id, UserService.relations);

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    return user;
  }

  async createUser(body: Partial<User>) {
    const queryRunner = this._dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Создаем пользователя
      const user = await this._userRepository.create({
        ...body,
      });

      // Создаем пустой профиль
      await this._profileRepository.create({
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
      body.email ?? null,
      body.phone ?? null,
    );

    if (existingUser) {
      throw new ConflictException("Пользователь уже существует");
    }

    const user = await this.createUser(body);

    await this.setPrivileges(user.id, ERole.ADMIN, []);

    // Если пользователь существует, возвращаем его с ролью ADMIN
    const existingUser1 = await this._userRepository.findByEmailOrPhone(
      body.email ?? null,
      body.phone ?? null,
    );

    if (existingUser1) {
      return this.setPrivileges(existingUser1.id, ERole.ADMIN, []);
    }

    throw new NotFoundException("Пользователь не найден");
  }

  async updateUser(id: string, body: IUserUpdateRequest) {
    await this._userRepository.update(id, body);

    return await this.getUser(id);
  }

  async setPrivileges(
    userId: string,
    roleName: IUserPrivilegesRequest["roleName"],
    permissions: IUserPrivilegesRequest["permissions"] = [],
  ) {
    const queryRunner = this._dataSource.createQueryRunner();

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
        role = await this._roleRepository.create({
          name: roleName,
        });
      }

      // Устанавливаем роль пользователю
      user.role = role;
      user.roleId = role.id;
      await this._userRepository.save(user);

      // Если есть разрешения, устанавливаем их для роли
      if (permissions.length > 0) {
        await this._roleRepository.setPermissions(role.id, permissions);
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

    return new ApiResponse({
      message: "Email успешно подтвержден.",
      data: {},
    });
  }

  async changePassword(userId: string, password: string) {
    const user = await this.getUser(userId);

    user.passwordHash = sha256(password);

    await this._userRepository.save(user);

    return new ApiResponse({ message: "Пароль успешно изменен." });
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
