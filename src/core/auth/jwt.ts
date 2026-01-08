import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import jwt, { sign, SignOptions, VerifyErrors } from "jsonwebtoken";
import { DataSource } from "typeorm";

import { config } from "../../../config";
import { iocContainer } from "../../app.container";
import { Permission } from "../../modules/permission/permission.entity";
import { EPermissions } from "../../modules/permission/permission.types";
import { Role } from "../../modules/role/role.entity";
import { ERole } from "../../modules/role/role.types";
import { User } from "../../modules/user/user.entity";
import { JWTDecoded } from "../../types/koa";

type RoleStrings = `role:${ERole}`;
type PermissionStrings = `permission:${EPermissions}`;
export type SecurityScopes = (RoleStrings | PermissionStrings)[];

export const createToken = (userId: string, opts?: SignOptions) =>
  new Promise<string>((resolve, reject) => {
    try {
      const token = sign({ userId }, config.auth.jwt.secretKey, opts);

      resolve(token);
    } catch (error) {
      reject(error);
    }
  });

export const createTokenAsync = (
  data: { userId: string; opts?: SignOptions }[],
) => Promise.all(data.map(value => createToken(value.userId, value.opts)));

export const verifyToken = (token: string) => {
  return new Promise<JWTDecoded>((resolve, reject) => {
    jwt.verify(
      token,
      config.auth.jwt.secretKey,
      async (err: VerifyErrors, decoded: JWTDecoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      },
    );
  });
};

export const verifyAuthToken = async (
  token?: string,
  scopes?: SecurityScopes,
): Promise<User> => {
  if (!token) {
    throw new UnauthorizedException();
  }

  try {
    // Верифицируем JWT токен
    const decoded = await new Promise<JWTDecoded>((resolve, reject) => {
      jwt.verify(
        token,
        config.auth.jwt.secretKey,
        (err: VerifyErrors, decoded: JWTDecoded) => {
          if (err) {
            reject(err);
          } else {
            resolve(decoded);
          }
        },
      );
    });

    // Получаем репозиторий пользователя
    const dataSource = iocContainer.get(DataSource);
    const userRepository = dataSource.getRepository(User);

    // Ищем пользователя с его ролью и разрешениями
    const user = await userRepository.findOne({
      where: { id: decoded.userId },
      relations: {
        role: {
          permissions: true,
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Пользователь не найден");
    }

    // Проверяем доступы если указаны scopes
    if (scopes && scopes.length > 0) {
      const roles = extractRoles(scopes);
      const permissions = extractPermissions(scopes);

      const isAdmin = user.role?.name === ERole.ADMIN;

      if (!isAdmin) {
        if (
          !user.role ||
          !hasRole(user.role, roles) ||
          !hasPermission(user.role, permissions)
        ) {
          throw new ForbiddenException(
            "Access denied: You do not have permission to perform this action.",
          );
        }
      }
    }

    return user;
  } catch (error) {
    if (
      error instanceof UnauthorizedException ||
      error instanceof ForbiddenException
    ) {
      throw error;
    }
    throw new UnauthorizedException("Неверный токен");
  }
};

const extractRoles = (scopes: SecurityScopes): string[] =>
  scopes.reduce<string[]>((roles, scope) => {
    if (scope.startsWith("role:")) {
      roles.push(scope.slice(5));
    }

    return roles;
  }, []);

const extractPermissions = (scopes: SecurityScopes): string[] =>
  scopes.reduce<string[]>((permissions, scope) => {
    if (scope.startsWith("permission:")) {
      permissions.push(scope.slice(11));
    }

    return permissions;
  }, []);

const hasRole = (role: Role | null, roles: string[]): boolean => {
  if (!role) {
    return false;
  }

  return roles.length === 0 || roles.includes(role.name);
};

const hasPermission = (role: Role | null, permissions: string[]): boolean => {
  if (!role || !role.permissions) {
    return false;
  }

  return (
    permissions.length === 0 ||
    role.permissions.some((permission: Permission) =>
      permissions.includes(permission.name),
    )
  );
};
