---
id: tech/redis-state
title: Что живёт в Redis
summary: Общее состояние процессов в Redis — ключи, TTL, поведение без Redis и при его сбое, префикс ключей.
layer: project
roles: [developer, architect, devops]
stages: [analysis, implementation]
depends_on: [tech/bootstrap]
---

# Что живёт в Redis

`src/core/redis/redis.ts`: `getRedis()` — общий клиент или `undefined` без `REDIS_URL`;
`createRedisClient(purpose)` — отдельное соединение (pub/sub). В production `REDIS_URL`
обязателен; в development и тестах без него всё работает в памяти одного процесса —
корректно только для одного процесса.

## Ключи

| Назначение              | Где                                        | Ключи / механизм                                                                            |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| общий rate limit        | `middleware/rate-limit.middleware.ts`      | `koa-ratelimit` (redis-driver), fail-open                                                   |
| лимит маршрута          | `core/guards/throttle.store.ts`            | `throttle:<name>:<ip>` — INCR + PTTL                                                        |
| отзыв сессий            | `core/auth/session-revocation.ts`          | `revoked:session:<id>`, TTL = `JWT_ACCESS_TTL`                                              |
| отзыв пользователя      | там же                                     | `revoked:user:<id>` (токены с `iat` не позже отметки)                                       |
| смена прав              | там же                                     | `privileges:changed:<id>` (токены с `pat` не позже отметки)                                 |
| попытки входа и 2FA     | `modules/auth/auth-attempts.store.ts`      | счётчики неудач с окном, блокировка `login:lock:<key>`, одноразовый `jti` 2FA (`claimOnce`) |
| presence                | `modules/socket/socket-client-registry.ts` | `presence:<userId>` — множество socket id, TTL 60 с, heartbeat 20 с                         |
| доставка событий сокета | `modules/socket/socket-server.service.ts`  | `@socket.io/redis-adapter` (pub/sub) — комнаты и `disconnect*` на всех процессах            |
| живое состояние модулей | `core/redis/live-store.ts`                 | `LiveStore(prefix)` — JSON с TTL, `setIfAbsent`, `incrBy`; наследников нет                  |

Проверка access-токена — один `MGET` трёх ключей отзыва плюс локальный кэш 1 с;
ошибка Redis — fail-open с записью в лог.

## Префикс

`REDIS_KEY_PREFIX` (вида `project:` или `project:e2e:`) — изоляция проекта в общем
Redis с ACL по префиксу: клиент сам добавляет префикс к ключам. e2e передаёт серверу
`E2E_REDIS_KEY_PREFIX` и чистит только свои ключи ([ops/e2e](../70-ops/e2e.md)).

## Что не в Redis

- Очередь задач и cron — pg-boss в Postgres (схема `pgboss`).
- Сессии, refresh-хеши, роли и права — Postgres; права по userId вне HTTP —
  `AccessService` без кэша.
- Межпроцессные сигналы БД — `core/db/pg-signals.ts` (`PgSignals`, LISTEN/NOTIFY);
  наследников в проекте нет.

Redis в production-стеке — без persistence, `allkeys-lru`: после его перезапуска
сбрасываются лимиты, presence и метки отзыва; постоянных данных в нём нет.
