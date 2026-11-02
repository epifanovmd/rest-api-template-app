import { Context } from "koa";

import { UnauthorizedException } from "../http";
import { IGuard } from "./types";

/**
 * Проверяет наличие API-ключа в указанном заголовке.
 * Используется для защиты внутренних/сервисных роутов.
 *
 * @param validKey — ожидаемый ключ
 * @param header   — заголовок (по умолчанию 'x-api-key')
 *
 * @example
 * @UseGuards(ApiKeyGuard(config.<секция>.apiKey, 'x-api-key'))
 * @Post('/internal/sync')
 */
export const ApiKeyGuard = (validKey: string, header = "x-api-key") =>
  class implements IGuard {
    process(ctx: Context): boolean {
      const key = ctx.headers[header];

      if (!key || key !== validKey) {
        throw new UnauthorizedException("Неверный или отсутствующий API-ключ.");
      }

      return true;
    }
  };
