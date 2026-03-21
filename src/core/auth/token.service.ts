import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import jwt, { VerifyErrors } from "jsonwebtoken";

import { config } from "../../config";
import { EPermissions } from "../../modules/permission/permission.types";
import { ERole } from "../../modules/role/role.types";
import { User } from "../../modules/user/user.entity";
import { AuthContext, JWTDecoded } from "../../types/koa";
import { Injectable } from "../decorators";
import { createTokenAsync } from "./jwt";

export interface ITokensDto {
  accessToken: string;
  refreshToken: string;
}

type RoleStrings = `role:${ERole}`;
type PermissionStrings = `permission:${EPermissions}`;
export type SecurityScopes = (RoleStrings | PermissionStrings)[];

@Injectable()
export class TokenService {
  /**
   * Issues access + refresh tokens with merged effective permissions.
   *
   * Effective permissions = union(role.permissions for each role) ∪ directPermissions.
   * Computed once at issue time — no DB hit needed during request auth.
   */
  async issue(user: User): Promise<ITokensDto> {
    const rolePermissions =
      user.roles?.flatMap(r => r.permissions?.map(p => p.name) ?? []) ?? [];
    const directPermissions = user.directPermissions?.map(p => p.name) ?? [];

    const effectivePermissions = [
      ...new Set([...rolePermissions, ...directPermissions]),
    ];

    const payload = {
      userId: user.id,
      roles: user.roles?.map(r => r.name) ?? [],
      permissions: effectivePermissions,
      emailVerified: user.emailVerified,
    };

    const [accessToken, refreshToken] = await createTokenAsync([
      {
        payload,
        opts: {
          expiresIn: process.env.NODE_ENV === "development" ? "1d" : "15m",
        },
      },
      { payload, opts: { expiresIn: "7d" } },
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Verifies JWT and checks scopes against the token's claims.
   * No DB queries — all information is embedded in the token.
   */
  async verify(token?: string, scopes?: SecurityScopes): Promise<AuthContext> {
    if (!token) {
      throw new UnauthorizedException();
    }

    let decoded: JWTDecoded;

    try {
      decoded = await new Promise<JWTDecoded>((resolve, reject) => {
        jwt.verify(
          token,
          config.auth.jwt.secretKey,
          (err: VerifyErrors | null, payload: JWTDecoded | undefined) => {
            if (err) reject(err);
            else resolve(payload!);
          },
        );
      });
    } catch {
      throw new UnauthorizedException("Неверный токен");
    }

    if (scopes && scopes.length > 0) {
      this.checkScopes(decoded, scopes);
    }

    return {
      userId: decoded.userId,
      roles: decoded.roles ?? [],
      permissions: decoded.permissions ?? [],
      emailVerified: decoded.emailVerified ?? false,
    };
  }

  /**
   * Checks that the decoded token satisfies ALL required scopes (AND semantics).
   *
   * Superadmin bypass:
   *   - role ADMIN → skips all checks
   *   - permission "*" → skips all checks
   *
   * Wildcard resolution for permissions:
   *   "wg:server:view" is satisfied by any of:
   *   - exact "wg:server:view"
   *   - wildcard "wg:server:*"
   *   - wildcard "wg:*"
   *   - wildcard "*"
   */
  private checkScopes(decoded: JWTDecoded, scopes: SecurityScopes): void {
    const roles = decoded.roles ?? [];
    const permissions = decoded.permissions ?? [];

    // Superadmin bypass
    if (
      roles.includes(ERole.ADMIN) ||
      this.hasPermission(permissions, EPermissions.ALL)
    ) {
      return;
    }

    for (const scope of scopes) {
      if (scope.startsWith("role:")) {
        const required = scope.slice(5) as ERole;

        if (!roles.includes(required)) {
          throw new ForbiddenException("Access denied: insufficient role.");
        }
      } else if (scope.startsWith("permission:")) {
        const required = scope.slice(11);

        if (!this.hasPermission(permissions, required)) {
          throw new ForbiddenException(
            "Access denied: insufficient permissions.",
          );
        }
      }
    }
  }

  /**
   * Checks if a user's permission set satisfies a required permission,
   * including wildcard resolution.
   *
   * Examples:
   *   hasPermission(["wg:*"], "wg:server:view")  → true
   *   hasPermission(["wg:server:*"], "wg:server:view")  → true
   *   hasPermission(["wg:peer:*"], "wg:server:view")  → false
   *   hasPermission(["*"], "anything")  → true
   */
  private hasPermission(userPerms: string[], required: string): boolean {
    // Global wildcard
    if (userPerms.includes(EPermissions.ALL)) return true;

    // Exact match
    if (userPerms.includes(required)) return true;

    // Wildcard expansion: "wg:server:view" → check "wg:server:*", then "wg:*"
    const parts = required.split(":");

    // eslint-disable-next-line no-plusplus
    for (let i = parts.length - 1; i >= 1; i--) {
      const wildcard = `${parts.slice(0, i).join(":")}:*`;

      if (userPerms.includes(wildcard)) return true;
    }

    return false;
  }
}
