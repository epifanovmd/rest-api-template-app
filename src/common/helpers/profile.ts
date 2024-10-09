import { UnauthorizedException } from "@force-dev/utils";

import { KoaRequest } from "../../types/koa";
import { assertNotNull } from "./assertNotNull";

export const getContextProfile = (req: KoaRequest) => {
  return assertNotNull(
    req.ctx.request.user?.profileId,
    new UnauthorizedException(),
  );
};
