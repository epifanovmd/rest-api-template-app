import Koa from "koa";

import { User } from "../modules/user/user.entity";

export type JWTDecoded = {
  userId: string;
  iat: number;
  exp: number;
};

interface RequestClient {
  ctx: {
    request: {
      user: User | undefined;
    };
  };
}

export type KoaRequest = Koa.Request & RequestClient;
