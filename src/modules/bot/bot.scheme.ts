import { inject } from "inversify";
import type { Request } from "koa";

import { Injectable, ISecurityScheme } from "../../core";
import type { AuthContext } from "../../types/koa";
import { BotError } from "./bot.errors";
import { BotService } from "./bot.service";

/** Длина колонки токена бота: длиннее — заведомо не наш. */
const BOT_TOKEN_MAX_LENGTH = 256;

/**
 * `@Security("bot")`: токен бота из `Authorization: Bot <token>` или
 * `X-Bot-Token`, проверяется по БД. Вызывающий — технический пользователь бота.
 * Нет токена — `BOT_TOKEN_REQUIRED`, неизвестный или бот отключён — `BOT_INVALID_TOKEN` (401).
 */
@Injectable()
export class BotSecurityScheme implements ISecurityScheme {
  readonly name = "bot";

  constructor(@inject(BotService) private readonly _bots: BotService) {}

  async authenticate(request: Request): Promise<AuthContext> {
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bot ")
      ? auth.slice(4)
      : (request.headers["x-bot-token"] as string | undefined);

    if (!token) throw BotError.TOKEN_REQUIRED();
    if (token.length > BOT_TOKEN_MAX_LENGTH) throw BotError.INVALID_TOKEN();

    const bot = await this._bots.findByToken(token);

    if (!bot || !bot.isActive) throw BotError.INVALID_TOKEN();

    return {
      kind: "bot",
      userId: bot.userId,
      sessionId: "",
      roles: [],
      permissions: [],
      emailVerified: true,
    };
  }
}
