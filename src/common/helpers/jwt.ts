import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import jwt, { sign, SignOptions, VerifyErrors } from "jsonwebtoken";

import { config } from "../../../config";
import { IProfileDto } from "../../modules/profile";
import { JWTDecoded } from "../../types/koa";

export const { JWT_SECRET_KEY } = config;

export const createToken = (profile: IProfileDto, opts?: SignOptions) =>
  new Promise<string>(resolve => {
    resolve(sign(profile, JWT_SECRET_KEY, opts));
  });

export const createTokenAsync = (
  data: { profile: IProfileDto; opts?: SignOptions }[],
) => Promise.all(data.map(value => createToken(value.profile, value.opts)));

export const verifyToken = (
  token?: string,
  scopes?: string[],
): Promise<JWTDecoded> =>
  new Promise((resolve, reject) => {
    if (!token) {
      reject(new UnauthorizedException());
    } else {
      return jwt.verify(
        token,
        JWT_SECRET_KEY,
        (err: VerifyErrors, decoded: JWTDecoded) => {
          if (err) {
            reject(err);
          }

          if (scopes && scopes.length > 0) {
            const roles = extractRoles(scopes);
            const permissions = extractPermissions(scopes);

            if (!hasRole(decoded, roles)) {
              throw new ForbiddenException("Role not found");
            }

            if (!hasPermission(decoded, permissions)) {
              throw new ForbiddenException("Permission not found");
            }
          }

          resolve(decoded);
        },
      );
    }
  });

const extractRoles = (scopes: string[]): string[] =>
  scopes.reduce<string[]>((roles, scope) => {
    if (scope.startsWith("role:")) {
      roles.push(scope.slice(5));
    }

    return roles;
  }, []);

const extractPermissions = (scopes: string[]): string[] =>
  scopes.reduce<string[]>((permissions, scope) => {
    if (scope.startsWith("permission:")) {
      permissions.push(scope.slice(11));
    }

    return permissions;
  }, []);

const hasRole = (decoded: JWTDecoded, roles: string[]): boolean =>
  roles.length === 0 || roles.includes(decoded.role.name);

const hasPermission = (decoded: JWTDecoded, permissions: string[]): boolean =>
  permissions.length === 0 ||
  decoded.role.permissions.some(({ name }) => permissions.includes(name));
