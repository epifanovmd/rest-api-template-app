import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import jwt, { sign, SignOptions, VerifyErrors } from "jsonwebtoken";

import { config } from "../../../config";
import { EPermissions } from "../../modules/permission";
import { IProfileDto } from "../../modules/profile";
// импортируем прямяком из файла что бы не было циклической зависимости
import { ProfileService } from "../../modules/profile/profile.service";
import { ERole, IRoleDto } from "../../modules/role";
import { JWTDecoded } from "../../types/koa";

export const { JWT_SECRET_KEY } = config;

type RoleStrings = `role:${ERole}`;
type PermissionStrings = `permission:${EPermissions}`;
export type SecurityScopes = (RoleStrings | PermissionStrings)[];

export const createToken = (profileId: string, opts?: SignOptions) =>
  new Promise<string>(resolve => {
    resolve(sign({ profileId }, JWT_SECRET_KEY, opts));
  });

export const createTokenAsync = (
  data: { profileId: string; opts?: SignOptions }[],
) => Promise.all(data.map(value => createToken(value.profileId, value.opts)));

export const verifyToken = async (
  token?: string,
  scopes?: SecurityScopes,
): Promise<IProfileDto> =>
  new Promise((resolve, reject) => {
    if (!token) {
      reject(new UnauthorizedException());
    } else {
      jwt.verify(
        token,
        JWT_SECRET_KEY,
        async (err: VerifyErrors, decoded: JWTDecoded) => {
          if (err) {
            reject(err);
          }

          try {
            const profile = await new ProfileService()
              .getProfile(decoded.profileId)
              .catch(() => null);

            if (!profile) {
              return reject(new UnauthorizedException());
            }

            const role = profile.role;
            const isAdmin = role.name === ERole.ADMIN;

            if (!isAdmin && scopes && scopes.length) {
              const roles = extractRoles(scopes);
              const permissions = extractPermissions(scopes);

              if (!hasRole(role, roles) || !hasPermission(role, permissions)) {
                return reject(
                  new ForbiddenException(
                    "Access denied: You do not have permission to perform this action.",
                  ),
                );
              }
            }

            resolve(profile);
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
