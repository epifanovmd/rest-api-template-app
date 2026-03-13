import { UnauthorizedException } from "@force-dev/utils";
import { Context } from "koa";

import { verifyAuthToken } from "../auth";
import { IGuard } from "./types";

export class AuthGuard implements IGuard {
  async process(ctx: Context): Promise<boolean> {
    const token = ctx.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      throw new UnauthorizedException();
    }

    const user = await verifyAuthToken(token);

    ctx.request["user"] = user;

    return !!user;
  }
}
