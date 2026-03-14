import Koa from "koa";

import { EPermissions } from "../modules/permission/permission.types";
import { ERole } from "../modules/role/role.types";

export type AuthContext = {
  userId: string;
  role: ERole | null;
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
