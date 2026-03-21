import Koa from "koa";

import { EPermissions } from "../modules/permission/permission.types";
import { ERole } from "../modules/role/role.types";

export type AuthContext = {
  userId: string;
  /** All roles assigned to this user. */
  roles: ERole[];
  /**
   * Effective permissions — pre-merged union of all role permissions
   * plus directPermissions. Computed at token issue time, no DB hit needed.
   */
  permissions: EPermissions[];
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
