import { ForbiddenException } from "@force-dev/utils";
import jwt, { sign, SignOptions, VerifyErrors } from "jsonwebtoken";

import { config } from "../../../config";
import { IProfileDto } from "../../modules/profile";
import { JWTDecoded } from "../../types/koa";
import { UnauthorizedException } from "../exceptions";

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
            const roles = _extractRoles(scopes);
            const permissions = _extractPermissions(scopes);

            if (!_hasRole(decoded, roles)) {
              throw new ForbiddenException("Role not found");
            }

            if (!_hasPermission(decoded, permissions)) {
              throw new ForbiddenException("Permission not found");
            }
          }

          resolve(decoded);
        },
      );
    }
  });

const _extractRoles = (scopes: string[]) =>
  scopes
    .filter(scope => scope.startsWith("role:"))
    .map(scope => scope.replace("role:", ""));

const _extractPermissions = (scopes: string[]) =>
  scopes
    .filter(scope => scope.startsWith("permission:"))
    .map(scope => scope.replace("permission:", ""));

const _hasRole = (decoded: JWTDecoded, roles: string[]) =>
  roles.length > 0
    ? roles.some(roleName => roleName === decoded.role.name)
    : true;

const _hasPermission = (decoded: JWTDecoded, permissions: string[]) =>
  permissions.length > 0
    ? decoded.role.permissions.some(({ name }) => permissions.includes(name))
    : true;
