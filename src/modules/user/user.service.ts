import { ConflictException, NotFoundException } from "@force-dev/utils";
import { inject, injectable } from "inversify";
import { Includeable, Op, WhereOptions } from "sequelize";
import sha256 from "sha256";

import { sequelize } from "../../db";
import { Injectable } from "../../decorators/injectable.decorator";
import { ApiResponse } from "../../dto/ApiResponse";
import { MailerService } from "../mailer";
import { OtpService } from "../otp";
import { Permission } from "../permission/permission.model";
import { Profile } from "../profile/profile.model";
import { ERole, Role } from "../role/role.model";
import {
  IUserPrivilegesRequest,
  IUserUpdateRequest,
  User,
  UserCreateModel,
  UserModel,
} from "./user.model";

@Injectable()
export class UserService {
  constructor(
    @inject(MailerService) private _mailerService: MailerService,
    @inject(OtpService) private _otpService: OtpService,
  ) {}

  getUsers = (offset?: number, limit?: number) =>
    User.findAll({
      limit,
      offset,
      attributes: UserService.attributes,
      order: [["createdAt", "DESC"]],
      include: UserService.include,
    });

  getUserByAttr = (where: WhereOptions<User>) =>
    User.findOne({
      where,
      include: UserService.include,
    }).then(result => {
      if (result === null) {
        return Promise.reject(new NotFoundException("Пользователь не найден"));
      }

      return result;
    });

  getUser = (id: string) =>
    User.findByPk(id, {
      attributes: UserService.attributes,
      include: UserService.include,
    }).then(result => {
      if (result === null) {
        return Promise.reject(new NotFoundException("Пользователь не найден"));
      }

      return result;
    });

  createUser = async (body: UserCreateModel) => {
    const transaction = await sequelize.transaction();

    const user = await User.create(body, { transaction });

    // Сразу создаем пустой профиль
    await Profile.create(
      {
        userId: user.id,
        status: "offline",
      },
      { transaction },
    );

    await transaction.commit();

    return this.setPrivileges(user.id, ERole.USER);
  };

  createAdmin = async (body: UserCreateModel) => {
    return this.getUserByAttr({
      [Op.or]: [{ email: body.email ?? "" }, { phone: body.phone ?? "" }],
    }).catch(async () => {
      const user = await this.createUser(body);

      return this.setPrivileges(user.id, ERole.ADMIN);
    });
  };

  updateUser = async (id: string, body: IUserUpdateRequest) => {
    await User.update(body, { where: { id } });

    return await this.getUser(id);
  };

  setPrivileges = async (
    userId: string,
    roleName: IUserPrivilegesRequest["roleName"],
    permissions: IUserPrivilegesRequest["permissions"] = [],
  ) => {
    const transaction = await sequelize.transaction();
    const user = await User.findByPk(userId, { transaction });

    if (!user) {
      return Promise.reject(new NotFoundException("Пользователь не найден"));
    }

    const [role] = await Role.findOrCreate({
      where: { name: roleName },
      transaction,
    });

    if (role) {
      await user.setRole(role, { transaction });

      const permissionInstances = await Promise.all(
        permissions.map(permissionName =>
          Permission.findOrCreate({
            where: { name: permissionName },
            transaction,
          }).then(([permission]) => permission),
        ),
      );

      await role.setPermissions(permissionInstances, { transaction });

      await transaction.commit();
    }

    return this.getUser(userId);
  };

  requestVerifyEmail = async (userId: string, email?: string) => {
    const user = await this.getUser(userId);

    if (user.emailVerified) {
      throw new ConflictException("Email уже подтвержден.");
    }

    if (!email) {
      throw new NotFoundException("У пользователя отсутсвует email.");
    }

    const otp = await this._otpService.create(userId);

    await this._mailerService.sendCodeMail(email, otp.code);

    return otp.code as any;
  };

  verifyEmail = async (userId: string, code: string) => {
    const user = await this.getUser(userId);

    if (user.emailVerified) {
      throw new ConflictException("Email уже подтвержден.");
    }

    if (await this._otpService.check(userId, code)) {
      user.emailVerified = true;
      await user.save();
    }

    return new ApiResponse({
      message: "Email успешно подтвержден.",
      data: {},
    });
  };

  changePassword = async (userId: string, password: string) => {
    const user = await this.getUser(userId);

    user.passwordHash = sha256(password);

    await user.save();

    return new ApiResponse({ message: "Пароль успешно изменен." });
  };

  deleteUser = async (userId: string) => {
    return User.destroy({ where: { id: userId } }).then(() => userId);
  };

  static get attributes(): (keyof UserModel)[] {
    return [
      "id",
      "email",
      "emailVerified",
      "phone",
      "challenge",
      "createdAt",
      "updatedAt",
    ];
  }

  static get include(): Includeable[] {
    return [
      {
        model: Role,
        attributes: ["name"],
        // attributes: { exclude: ["createdAt", "updatedAt"] },
        include: [
          {
            model: Permission,
            attributes: ["name"],
            // attributes: { exclude: ["createdAt", "updatedAt"] },
            through: {
              attributes: [], // Исключаем атрибуты связывающей таблицы
            },
          },
        ],
      },
    ];
  }
}
