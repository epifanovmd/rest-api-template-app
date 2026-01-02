import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import jwt, { sign, SignOptions, VerifyErrors } from "jsonwebtoken";

import { config } from "../../../config";
import {
  EPermissions,
  Permission,
} from "../../modules/permission/permission.model";
import { ERole, IRoleDto, Role } from "../../modules/role/role.model";
import { IUserDto, User } from "../../modules/user/user.model";
import { JWTDecoded } from "../../types/koa";

type RoleStrings = `role:${ERole}`;
type PermissionStrings = `permission:${EPermissions}`;
export type SecurityScopes = (RoleStrings | PermissionStrings)[];

export const createToken = (userId: string, opts?: SignOptions) =>
  new Promise<string>(resolve => {
    resolve(sign({ userId }, config.auth.jwt.secretKey, opts));
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
): Promise<IUserDto> =>
  new Promise((resolve, reject) => {
    if (!token) {
      reject(new UnauthorizedException());
    } else {
      jwt.verify(
        token,
        config.auth.jwt.secretKey,
        async (err: VerifyErrors, decoded: JWTDecoded) => {
          if (err) {
            reject(err);
          }

          try {
            const user = await User.findByPk(decoded.userId, {
              include: {
                model: Role,
                include: [
                  {
                    model: Permission,
                    through: {
                      attributes: [], // Исключаем атрибуты связывающей таблицы
                    },
                  },
                ],
              },
            }).catch(() => null);

            if (!user) {
              return reject(new UnauthorizedException());
            }

            const role = user.role;
            const isAdmin = role.name === ERole.ADMIN;

            if (!isAdmin && scopes && scopes.length) {
              const roles = extractRoles(scopes);
              const permissions = extractPermissions(scopes);

              if (!hasRole(role, roles) || !hasPermission(role, permissions)) {
                reject(
                  new ForbiddenException(
                    "Access denied: You do not have permission to perform this action.",
                  ),
                );
              }
            }

            resolve(user);
          } catch (e) {
            reject(e);
          }
        },
      );
    }
  });

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

const hasRole = (role: IRoleDto, roles: string[]): boolean =>
  roles.length === 0 || roles.includes(role.name);

const hasPermission = (role: IRoleDto, permissions: string[]): boolean =>
  permissions.length === 0 ||
  role.permissions.some(({ name }) => permissions.includes(name));
