import Koa from "koa";

interface IUser {
  ctx: {
    request: {
      user:
        | {
            id: string;
          }
        | undefined;
    };
  };
}

export type KoaRequest = Koa.Request & IUser;
