import { KoaRequest } from "../../types/koa";
import { UnauthorizedException } from "../exceptions";
import { assertNotNull } from "./assertNotNull";

export const getContextProfile = (req: KoaRequest) => {
  return assertNotNull(req.ctx.request.user?.id, new UnauthorizedException());
};
