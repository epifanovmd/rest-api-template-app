import { ForbiddenException, UnauthorizedException } from "@force-dev/utils";
import jwt, { VerifyErrors } from "jsonwebtoken";

import { config } from "../../config";
import { EPermissions } from "../../modules/permission/permission.types";
import { ERole } from "../../modules/role/role.types";
import { User } from "../../modules/user/user.entity";
import { AuthContext, JWTDecoded } from "../../types/koa";
import { Injectable } from "../decorators";
import { hasPermission } from "./has-permission";
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
   * Выдаёт access + refresh токены с объединёнными эффективными разрешениями.
   *
   * Эффективные разрешения = объединение(role.permissions для каждой роли) ∪ directPermissions.
   * Вычисляется один раз при выдаче — без обращения к БД при аутентификации запроса.
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
   * Верифицирует JWT и проверяет области действия относительно данных токена.
   * Без запросов к БД — вся информация встроена в токен.
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
   * Проверяет, что декодированный токен удовлетворяет ВСЕМ требуемым областям (семантика AND).
   *
   * Обход суперадмина:
   *   - роль ADMIN → пропускает все проверки
   *   - разрешение "*" → пропускает все проверки
   */
  private checkScopes(decoded: JWTDecoded, scopes: SecurityScopes): void {
    const roles = decoded.roles ?? [];
    const permissions = decoded.permissions ?? [];

    // Обход суперадмина
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
   * Проверяет, удовлетворяет ли набор разрешений пользователя требуемому разрешению,
   * включая разрешение wildcards.
   */
  private hasPermission(userPerms: string[], required: string): boolean {
    return hasPermission(userPerms, required);
  }
}
