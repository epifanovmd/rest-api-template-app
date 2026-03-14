import { ForbiddenException } from "@force-dev/utils";
import { Context } from "koa";

import { IGuard } from "./types";

/**
 * Разрешает доступ только с указанных IP-адресов.
 * Поддерживает IPv4, IPv6 и CIDR-нотацию не поддерживается (точное совпадение).
 * Учитывает x-forwarded-for за прокси.
 *
 * @example
 * @UseGuards(IpWhitelistGuard(['127.0.0.1', '::1']))
 * @Get('/admin/internal')
 */
export const IpWhitelistGuard = (allowedIps: string[]) =>
  class implements IGuard {
    process(ctx: Context): boolean {
      const forwarded = ctx.request.headers["x-forwarded-for"];
      const ip = forwarded
        ? (typeof forwarded === "string" ? forwarded : forwarded[0])
            .split(",")[0]
            .trim()
        : ctx.ip;

      if (!allowedIps.includes(ip)) {
        throw new ForbiddenException(`Access denied for IP: ${ip}`);
      }

      return true;
    }
  };
