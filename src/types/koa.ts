import Koa from "koa";

import { EPermissions } from "../modules/permission";
import { IProfileDto } from "../modules/profile";
import { ERole } from "../modules/role";

export type JWTDecoded = IProfileDto & { iat: number; exp: number };

interface RequestClient {
  ctx: {
    request: {
      user: JWTDecoded | undefined;
    };
  };
}

export type KoaRequest = Koa.Request & RequestClient;
