import Koa from "koa";

import { IProfileDto } from "../modules/profile";

export type JWTDecoded = IProfileDto & { iat: number; exp: number };

interface RequestClient {
  ctx: {
    request: {
      user: JWTDecoded | undefined;
    };
  };
}

export type KoaRequest = Koa.Request & RequestClient;
