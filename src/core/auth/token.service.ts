import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import { inject } from "inversify";
import jwt, { VerifyErrors } from "jsonwebtoken";

import { config } from "../../../config";
import { EPermissions } from "../../modules/permission/permission.types";
import { ERole } from "../../modules/role/role.types";
import { User } from "../../modules/user/user.entity";
import { AuthContext, JWTDecoded } from "../../types/koa";

export interface ITokensDto {
  accessToken: string;
  refreshToken: string;
}
import { Injectable } from "../decorators";
import { createTokenAsync } from "./jwt";

type RoleStrings = `role:${ERole}`;
type PermissionStrings = `permission:${EPermissions}`;
export type SecurityScopes = (RoleStrings | PermissionStrings)[];

@Injectable()
export class TokenService {
  /**
   * Выдаёт пару access + refresh токенов с вложенными claims пользователя.
   * Вызывать только после загрузки полного User с role.permissions.
   */
  async issue(user: User): Promise<ITokensDto> {
    const payload = {
      userId: user.id,
      role: user.role?.name ?? null,
      permissions: user.role?.permissions?.map(p => p.name) ?? [],
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
   * Верифицирует JWT и проверяет scopes по claims.
   * Не делает запросов в БД.
   */
  async verify(
    token?: string,
    scopes?: SecurityScopes,
  ): Promise<AuthContext> {
    if (!token) {
      throw new UnauthorizedException();
    }

    let decoded: JWTDecoded;

    try {
      decoded = await new Promise<JWTDecoded>((resolve, reject) => {
        jwt.verify(
          token,
          config.auth.jwt.secretKey,
          (err: VerifyErrors, payload: JWTDecoded) => {
            if (err) reject(err);
            else resolve(payload);
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
      role: decoded.role,
      permissions: decoded.permissions ?? [],
      emailVerified: decoded.emailVerified ?? false,
    };
  }

  private checkScopes(decoded: JWTDecoded, scopes: SecurityScopes): void {
    if (decoded.role === ERole.ADMIN) return;

    for (const scope of scopes) {
      if (scope.startsWith("role:")) {
        const required = scope.slice(5) as ERole;

        if (decoded.role !== required) {
          throw new ForbiddenException("Access denied: insufficient role.");
        }
      } else if (scope.startsWith("permission:")) {
        const required = scope.slice(11) as EPermissions;

        if (!(decoded.permissions ?? []).includes(required)) {
          throw new ForbiddenException(
            "Access denied: insufficient permissions.",
          );
        }
      }
    }
  }
}
