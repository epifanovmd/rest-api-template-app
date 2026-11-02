import { Context } from "koa";

import { AuthContext } from "../../types/koa";
import { ForbiddenException, UnauthorizedException } from "../http";
import { IGuard } from "./types";

/**
 * Требует подтверждённого email у пользователя.
 * Читает `emailVerified` из контекста аутентификации (`ctx.state.user`), который
 * заполняет схема безопасности после проверки токена и отзыва сессии.
 * Должен использоваться вместе с @Security('jwt').
 *
 * @example
 * @Security('jwt')
 * @UseGuards(RequireVerifiedEmailGuard)
 * @Post('/send-message')
 */
export class RequireVerifiedEmailGuard implements IGuard {
  process(ctx: Context): boolean {
    const user = ctx.state.user as AuthContext | undefined;

    if (!user) {
      throw new UnauthorizedException();
    }

    if (!user.emailVerified) {
      throw new ForbiddenException("Требуется подтверждённый email.");
    }

    return true;
  }
}
