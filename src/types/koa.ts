import Koa from "koa";

export type JWTDecoded = {
  profileId: string;
  iat: number;
  exp: number;
};

interface RequestClient {
  ctx: {
    request: {
      user: JWTDecoded | undefined;
    };
  };
}

export type KoaRequest = Koa.Request & RequestClient;
