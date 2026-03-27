import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@force-dev/utils";
import bcrypt from "bcrypt";
import { inject } from "inversify";
import { DataSource, FindOptionsRelations, FindOptionsWhere, ILike } from "typeorm";

import { ApiResponseDto, EventBus, Injectable } from "../../core";
import { MailerService } from "../mailer";
import { OtpService } from "../otp";
import { PermissionRepository } from "../permission";
import { ProfileRepository } from "../profile";
import { Profile } from "../profile/profile.entity";
import { EProfileStatus } from "../profile/profile.types";
import { RoleRepository } from "../role";
import { Roles } from "../role/role.types";
import {
  IUserOptionDto,
  IUserPrivilegesRequestDto,
  IUserUpdateRequestDto,
} from "./dto";
import { EmailVerifiedEvent, PasswordChangedEvent, UserDeletedEvent, UsernameChangedEvent, UserPrivilegesChangedEvent } from "./events";
import { User } from "./user.entity";
import { UserRepository } from "./user.repository";

/** Сервис для управления пользователями: CRUD, права доступа, верификация email, смена пароля. */
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
    @inject(DataSource) private _dataSource: DataSource,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  /** Получить список пользователей с пагинацией и опциональной фильтрацией по email. */
  async getUsers(offset?: number, limit?: number, query?: string) {
    return this._userRepository.findAndCount({
      where: query ? [{ email: ILike(`%${query}%`) }] : undefined,
      skip: offset,
      take: limit,
      order: { createdAt: "DESC" },
    });
  }

  /** Получить список пользователей в формате для выпадающего списка. */
  async getOptions(query?: string): Promise<IUserOptionDto[]> {
    return this._userRepository.findOptions(query);
  }

  /** Найти пользователя по email или телефону; выбрасывает NotFoundException если не найден. */
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

  /** Получить пользователя по ID со всеми связями; выбрасывает NotFoundException если не найден. */
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

  /** Создать нового пользователя, его профиль и назначить роль USER по умолчанию. */
  async createUser(body: Partial<User>) {
    const userId = await this._dataSource.transaction(async manager => {
      const userRepo = manager.getRepository(User);
      const profileRepo = manager.getRepository(Profile);

      const user = userRepo.create({ ...body });
      const savedUser = await userRepo.save(user);

      const profile = profileRepo.create({
        userId: savedUser.id,
        status: EProfileStatus.Offline,
      });

      await profileRepo.save(profile);

      return savedUser.id;
    });

    return this.setPrivileges(userId, {
      roles: [Roles.USER],
      permissions: [],
    });
  }

  /** Создать нового пользователя с ролью ADMIN; выбрасывает ConflictException если уже существует. */
  async createAdmin(body: Partial<User>) {
    const existingUser = await this._userRepository.findByEmailOrPhone(
      body.email ?? undefined,
      body.phone ?? undefined,
    );

    if (existingUser) {
      throw new ConflictException("Пользователь уже существует");
    }

    const user = await this.createUser(body);

    if (user) {
      return this.setPrivileges(user.id, {
        roles: [Roles.ADMIN],
        permissions: [],
      });
    }

    throw new NotFoundException("Пользователь не найден");
  }

  /** Обновить данные пользователя и вернуть обновлённую запись. */
  async updateUser(id: string, body: IUserUpdateRequestDto) {
    const user = await this._userRepository.updateWithResponse(id, body);

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    return user;
  }

  /** Установить или сбросить WebAuthn challenge для пользователя (TTL 5 минут). */
  async setChallenge(id: string, challenge: string | null) {
    await this._userRepository.update(id, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      challenge: challenge as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      challengeExpiresAt: challenge ? new Date(Date.now() + 5 * 60 * 1000) as any : null,
    });
  }

  /**
   * Назначает роли и прямые разрешения пользователю.
   *
   * - Заменяет все текущие роли переданным списком.
   * - Заменяет все текущие прямые разрешения переданным списком.
   * - Разрешения на уровне ролей управляются отдельно через setRolePermissions().
   *
   * Эффективные разрешения в JWT = объединение(role.permissions) ∪ permissions.
   */
  async setPrivileges(
    userId: string,
    body: IUserPrivilegesRequestDto,
  ): Promise<User> {
    const user = await this._userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    // Назначаем роли (ищем или создаём каждую)
    user.roles = await Promise.all(
      body.roles.map(async roleName => {
        let role = await this._roleRepository.findByName(roleName);

        if (!role) {
          role = await this._roleRepository.createAndSave({ name: roleName });
        }

        return role;
      }),
    );

    // Назначаем прямые разрешения (ищем или создаём каждое)
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

    this._eventBus.emit(
      new UserPrivilegesChangedEvent(
        userId,
        body.roles,
        body.permissions,
      ),
    );

    return this.getUser(userId);
  }

  /** Инициировать верификацию email — отправить OTP-код на почту пользователя. */
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

  /** Подтвердить email пользователя с помощью OTP-кода. */
  async verifyEmail(userId: string, code: string) {
    const user = await this.getUser(userId);

    if (user.emailVerified) {
      throw new ConflictException("Email уже подтвержден.");
    }

    if (await this._otpService.check(userId, code)) {
      await this._userRepository.update(userId, { emailVerified: true });

      this._eventBus.emit(new EmailVerifiedEvent(userId));
    }

    return new ApiResponseDto({
      message: "Email успешно подтвержден.",
    });
  }

  /** Установить новый пароль пользователю (bcrypt-хеш). */
  async changePassword(userId: string, password: string) {
    await this._userRepository.update(userId, {
      passwordHash: await bcrypt.hash(password, 12),
    });

    this._eventBus.emit(new PasswordChangedEvent(userId, "change"));

    return new ApiResponseDto({ message: "Пароль успешно изменен." });
  }

  /** Удалить пользователя по ID; возвращает true если запись была удалена. */
  async deleteUser(userId: string) {
    this._eventBus.emit(new UserDeletedEvent(userId));

    const deleted = await this._userRepository.delete(userId);

    return !!deleted.affected;
  }

  /** Установить username для пользователя. */
  async setUsername(userId: string, username: string) {
    if (!(/^[a-z0-9_]{5,32}$/).test(username)) {
      throw new BadRequestException(
        "Username: 5-32 символа, допустимы a-z, 0-9, _",
      );
    }

    const existing = await this._userRepository.findByUsername(username);

    if (existing && existing.id !== userId) {
      throw new ConflictException("Этот username уже занят");
    }

    await this._userRepository.update(userId, { username });

    this._eventBus.emit(new UsernameChangedEvent(userId, username));

    return this.getUser(userId);
  }

  /** Поиск пользователей по запросу. */
  async searchUsers(query: string, limit: number = 20, offset: number = 0) {
    return this._userRepository.searchByQuery(query, limit, offset);
  }

  /** Получить пользователя по username. */
  async getUserByUsername(username: string) {
    const user = await this._userRepository.findByUsername(
      username,
      UserService.relations,
    );

    if (!user) {
      throw new NotFoundException("Пользователь не найден");
    }

    return user;
  }

  /** Стандартный набор связей, загружаемых при запросах пользователя. */
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
