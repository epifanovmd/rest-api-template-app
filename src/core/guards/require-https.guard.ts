import { ForbiddenException } from "@force-dev/utils";
import { Context } from "koa";

import { IGuard } from "./types";

/**
 * Требует HTTPS-соединения.
 * Учитывает заголовок x-forwarded-proto для работы за прокси/балансировщиком.
 *
 * @example
 * @UseGuards(RequireHttpsGuard)
 * @Get('/secure-endpoint')
 */
export class RequireHttpsGuard implements IGuard {
  process(ctx: Context): boolean {
    const proto = ctx.request.headers["x-forwarded-proto"];
    const isHttps =
      ctx.secure || proto === "https" || ctx.request.protocol === "https";

    if (!isHttps) {
      throw new ForbiddenException("HTTPS required.");
    }

    return true;
  }
}
