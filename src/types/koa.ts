import Koa from "koa";

import { IUserDto } from "../modules/user/user.dto";

export type JWTDecoded = {
  userId: string;
  iat: number;
  exp: number;
};

interface RequestClient {
  ctx: {
    request: {
      user: IUserDto | undefined;
    };
  };
}

export type KoaRequest = Koa.Request & RequestClient;
