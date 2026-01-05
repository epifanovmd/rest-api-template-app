import { UnauthorizedException } from "@force-dev/utils";

import { assertNotNull } from "../../common";
import { KoaRequest } from "../../types/koa";

export const getContextUser = (req: KoaRequest) => {
  return assertNotNull(req.ctx.request.user, new UnauthorizedException());
};
