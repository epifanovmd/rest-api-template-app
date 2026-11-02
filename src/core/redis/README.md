---
module: core/redis
summary: Клиенты Redis для состояния, общего между процессами, и LiveStore — живое состояние с TTL с откатом на память процесса.
---

# redis

Доступ к Redis для всего, что должно быть общим у реплик: лимиты, отзыв токенов,
presence, адаптер Socket.IO. Без `REDIS_URL` потребители работают в памяти процесса.

## Public API

| Экспорт                                       | Что                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `getRedis()`                                  | общий клиент для обычных команд; `undefined` без `REDIS_URL`                |
| `isRedisConfigured()`                         | задан ли `REDIS_URL`                                                        |
| `createRedisClient(purpose, { prefixKeys? })` | отдельное соединение (pub/sub, адаптер); без `REDIS_URL` — исключение       |
| `closeRedis()`                                | закрыть общий клиент                                                        |
| `LiveStore(prefix)`                           | `getJson`/`setJson`/`delete`/`setIfAbsent`/`incrBy` с TTL; Redis или память |

## Устройство

- `REDIS_KEY_PREFIX` (`config.redis.keyPrefix`) — изоляция проекта в общем Redis.
  `prefixKeys: false` — клиент сам задаёт полные имена (иначе ioredis добавит префикс
  и к шардированным каналам).
- Имя соединения — `<app.name>:<purpose>`; ошибки соединения логируются, ioredis
  переподключается сам.
- `LiveStore` модуль наследует со своим префиксом и регистрирует в DI. Без Redis —
  карта в памяти с ленивой очисткой просроченного.

## Зависимости

`config`, `core/logger`, `ioredis`. Используют: `core/auth` (отзыв токенов),
`core/guards` (`ThrottleGuard`), `middleware/rate-limit.middleware.ts`,
`routing/system-routes.ts` (`/health`), модули auth (попытки входа) и socket
(presence, адаптер). `LiveStore` в шаблоне наследников не имеет.

## Gotcha

- В production `REDIS_URL` обязателен (проверка конфига): без него лимиты, отзыв
  токенов и presence у каждой реплики свои.
- Общий клиент создаётся лениво при первом `getRedis()` — в том числе при импорте
  `middleware` (лимит запросов создаётся на уровне модуля).
- `closeRedis()` в коде приложения не вызывается.
