import { KoaRequest } from "../../types/koa";
import { assertNotNull } from "../assertNotNull";
import { ApiError } from "../handlers";

export const getContextProfile = (req: KoaRequest) => {
  return assertNotNull(
    req.ctx.request.user?.id,
    new ApiError("No token provided", 401),
  );
};
