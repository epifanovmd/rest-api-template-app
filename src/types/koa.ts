import Koa from "koa";

import { TPermission } from "../modules/permission/permission.types";
import { TRole } from "../modules/role/role.types";

export type AuthContext = {
  userId: string;
  sessionId: string;
  /** Все роли, назначенные этому пользователю. */
  roles: TRole[];
  /**
   * Эффективные разрешения — предварительно объединённый набор всех разрешений ролей
   * плюс directPermissions. Вычисляются при выдаче токена, без запросов к БД.
   */
  permissions: TPermission[];
  emailVerified: boolean;
};

export type JWTDecoded = AuthContext & {
  iat: number;
  exp: number;
};

interface RequestClient {
  ctx: {
    request: {
      user: AuthContext | undefined;
    };
  };
}

export type KoaRequest = Koa.Request & RequestClient;
