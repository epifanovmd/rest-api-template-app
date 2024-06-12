import Koa from "koa";
import { PrivateProfile } from "../services/auth";

export type JWTDecoded = PrivateProfile & { iat: number; exp: number };

interface RequestClient {
  ctx: {
    request: {
      user: JWTDecoded | undefined;
    };
  };
}

export type KoaRequest = Koa.Request & RequestClient;
