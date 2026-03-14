import { UnauthorizedException } from "@force-dev/utils";

import { AuthContext, KoaRequest } from "../../types/koa";

export const getContextUser = (req: KoaRequest): AuthContext => {
  const user = req.ctx.request.user;

  if (!user) {
    throw new UnauthorizedException();
  }

  return user;
};
