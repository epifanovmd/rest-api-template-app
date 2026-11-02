---
module: core/guards
summary: Гарды маршрутов для @UseGuards — лимит частоты по IP (Redis или память), HTTPS, белый список IP, статический ключ, подтверждённый email.
---

# guards

Проверки уровня маршрута, которые не выражаются через `@Security`: лимит частоты
и технические ограничения доступа.

## Public API

| Экспорт                                                                                          | Что                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `IGuard`                                                                                         | `process(ctx): boolean \| Promise<boolean>`                                                                  |
| `ThrottleGuard(limit, windowMs, name?, store?)`                                                  | лимит запросов маршрута на IP; превышение — 429 + `Retry-After`                                              |
| `IThrottleStore`, `ThrottleHit`, `getThrottleStore`, `MemoryThrottleStore`, `RedisThrottleStore` | хранилище счётчиков                                                                                          |
| `RequireVerifiedEmailGuard`                                                                      | 403 «Требуется подтверждённый email.», если `ctx.state.user.emailVerified = false`; 401 без `ctx.state.user` |
| `RequireHttpsGuard`                                                                              | 403 «Требуется HTTPS.» без `ctx.secure`                                                                      |
| `IpWhitelistGuard(ips)`                                                                          | 403 для IP вне списка                                                                                        |
| `ApiKeyGuard(key, header?)`                                                                      | статический ключ в заголовке (по умолчанию `x-api-key`); иначе 401 «Неверный или отсутствующий API-ключ.»    |

## Устройство

- `ThrottleGuard` — фабрика класса; ключ счётчика `throttle:<name>:<ctx.ip>`.
  Маршруты с одним `name` делят лимит. Хранилище по умолчанию — Redis
  (`INCR` + `PTTL`), без `REDIS_URL` — память процесса.
- `ctx.ip` и `ctx.secure` учитывают `X-Forwarded-*` только при
  `config.server.trustProxy` (`koa.proxy`).
- Подключение — `@UseGuards(...)` из `core/decorators`; гард выполняется после
  `@Security`.

## Зависимости

`core/http`, `core/redis`, `types/koa.ts` (`AuthContext`). Используют: `ThrottleGuard` —
auth, biometric, passkeys, user. Остальные гарды в шаблоне не применяются.

## Gotcha

- Всегда задавать `name` у `ThrottleGuard`: умолчание — порядковый номер создания,
  оно меняется при перестановке маршрутов.
- `RequireVerifiedEmailGuard` читает `emailVerified` из `ctx.state.user` — контекста,
  который схема `jwt` заполняет после проверки токена и отзыва сессии; токен сам не
  разбирает. Ставить только вместе с `@Security("jwt")`: без него `ctx.state.user`
  пуст — 401.
- `ApiKeyGuard` — для внутреннего статического ключа; ключи сервисов — схема `apiKey`
  модуля api-key, не этот гард.
