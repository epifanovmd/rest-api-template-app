import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import { inject } from "inversify";
import jwt, { VerifyErrors } from "jsonwebtoken";
import { DataSource } from "typeorm";

import { config } from "../../../config";
import { Permission } from "../../modules/permission/permission.entity";
import { EPermissions } from "../../modules/permission/permission.types";
import { Role } from "../../modules/role/role.entity";
import { ERole } from "../../modules/role/role.types";
import { User } from "../../modules/user/user.entity";
import { JWTDecoded } from "../../types/koa";
import { Injectable } from "../decorators";

type RoleStrings = `role:${ERole}`;
type PermissionStrings = `permission:${EPermissions}`;
export type SecurityScopes = (RoleStrings | PermissionStrings)[];

@Injectable()
export class TokenVerification {
  constructor(@inject(DataSource) private readonly dataSource: DataSource) {}

  async verifyAuthToken(
    token?: string,
    scopes?: SecurityScopes,
  ): Promise<User> {
    if (!token) {
      throw new UnauthorizedException();
    }

    try {
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

      const user = await this.dataSource.getRepository(User).findOne({
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

      if (scopes && scopes.length > 0) {
        const roles = this.extractRoles(scopes);
        const permissions = this.extractPermissions(scopes);
        const isAdmin = user.role?.name === ERole.ADMIN;

        if (!isAdmin) {
          if (
            !user.role ||
            !this.hasRole(user.role, roles) ||
            !this.hasPermission(user.role, permissions)
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
  }

  private extractRoles(scopes: SecurityScopes): string[] {
    return scopes.reduce<string[]>((roles, scope) => {
      if (scope.startsWith("role:")) {
        roles.push(scope.slice(5));
      }

      return roles;
    }, []);
  }

  private extractPermissions(scopes: SecurityScopes): string[] {
    return scopes.reduce<string[]>((permissions, scope) => {
      if (scope.startsWith("permission:")) {
        permissions.push(scope.slice(11));
      }

      return permissions;
    }, []);
  }

  private hasRole(role: Role | null, roles: string[]): boolean {
    if (!role) {
      return false;
    }

    return roles.length === 0 || roles.includes(role.name);
  }

  private hasPermission(role: Role | null, permissions: string[]): boolean {
    if (!role || !role.permissions) {
      return false;
    }

    return (
      permissions.length === 0 ||
      role.permissions.some((permission: Permission) =>
        permissions.includes(permission.name),
      )
    );
  }
}
