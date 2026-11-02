---
module: core/guards
summary: Гарды маршрутов для @UseGuards — лимит частоты по IP (Redis или память), HTTPS, белый список IP, статический ключ, подтверждённый email.
---

# guards

Проверки уровня маршрута, которые не выражаются через `@Security`: лимит частоты
и технические ограничения доступа.

## Public API

| Экспорт                                                                                          | Что                                                             |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `IGuard`                                                                                         | `process(ctx): boolean \| Promise<boolean>`                     |
| `ThrottleGuard(limit, windowMs, name?, store?)`                                                  | лимит запросов маршрута на IP; превышение — 429 + `Retry-After` |
| `IThrottleStore`, `ThrottleHit`, `getThrottleStore`, `MemoryThrottleStore`, `RedisThrottleStore` | хранилище счётчиков                                             |
| `RequireVerifiedEmailGuard`                                                                      | 403, если в access-токене `emailVerified = false`               |
| `RequireHttpsGuard`                                                                              | 403 без `ctx.secure`                                            |
| `IpWhitelistGuard(ips)`                                                                          | 403 для IP вне списка                                           |
| `ApiKeyGuard(key, header?)`                                                                      | статический ключ в заголовке (по умолчанию `x-api-key`)         |

## Устройство

- `ThrottleGuard` — фабрика класса; ключ счётчика `throttle:<name>:<ctx.ip>`.
  Маршруты с одним `name` делят лимит. Хранилище по умолчанию — Redis
  (`INCR` + `PTTL`), без `REDIS_URL` — память процесса.
- `ctx.ip` и `ctx.secure` учитывают `X-Forwarded-*` только при
  `config.server.trustProxy` (`koa.proxy`).
- Подключение — `@UseGuards(...)` из `core/decorators`; гард выполняется после
  `@Security`.

## Зависимости

`core/http`, `core/redis`, `core/auth` (`verifyToken`). Используют: `ThrottleGuard` —
auth, biometric, passkeys, user. Остальные гарды в шаблоне не применяются.

## Gotcha

- Всегда задавать `name` у `ThrottleGuard`: умолчание — порядковый номер создания,
  оно меняется при перестановке маршрутов.
- `RequireVerifiedEmailGuard` сам разбирает токен через `verifyToken` (без отзыва и
  scope) — ставить только вместе с `@Security("jwt")`.
- `ApiKeyGuard` — для внутреннего статического ключа; ключи сервисов — схема `apiKey`
  модуля api-key, не этот гард.
