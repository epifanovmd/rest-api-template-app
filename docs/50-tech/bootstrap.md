---
id: tech/bootstrap
title: Запуск, остановка и реестры
summary: Порядок bootstrap в app.ts, остановка по SIGTERM, реестры расширения ядра (токен → хелпер → реализации в проекте).
layer: project
roles: [developer, architect]
stages: [analysis, planning, implementation]
depends_on: [domain/modules]
---

# Запуск, остановка и реестры

## Запуск (`src/main.ts` → `App.start()` в `src/app.ts`)

`main.ts` первым импортирует `core/observability/instrument` (Sentry до остальных
модулей), затем создаёт `App({ rootModule: AppModule, dataSource })`. DataSource —
default-экспорт `src/data-source.ts` (его же читает CLI TypeORM).

1. `registerCoreBindings()` — в контейнер: `DataSource`, `Koa`, `HttpServer`.
2. Middleware: `metricsMiddleware` → `RegisterBaseMiddlewares` (requestId → requestLogger
   → error) → системные маршруты (`/ping`, `/ready`, `/health`, `/metrics`) →
   `rawHttpMiddleware` (`RAW_HTTP_HANDLER`) → `RegisterAppMiddlewares` (helmet → cors →
   rateLimit → bodyParser).
3. `listen()` — HTTP поднят до БД (пробы отвечают сразу, `/ready` — 503); ошибка
   `listen` отклоняет запуск.
4. `connectDatabase()` — повторы без предела, backoff 1 → 30 с.
5. `applyMigrations()` — при `DB_MIGRATIONS_RUN=true` под advisory-lock; иначе
   ожидающие миграции — ошибка запуска ([ops/migrations](../70-ops/migrations.md)).
6. `DbHealthMonitor.start()` — `SELECT 1` раз в 10 с.
7. `ModuleLoader.load(AppModule)` — биндинги всех модулей (singleton).
8. Если `APP_ROLE !== "worker"` — `configureAppRoutes()`: Swagger (при
   `API_DOCS_ENABLED`), tsoa `RegisterRoutes` с multer, все `ROUTE_PROVIDER`,
   `notFoundMiddleware`.
9. `runBootstrappers()` — по порядку регистрации; сбой некритичного (`critical = false`)
   логируется, критичного — валит запуск.
10. `isReady = true`; `/ready` = готовность приложения **и** здоровье БД.

## Остановка (`App.stop`, идемпотентна)

SIGTERM/SIGINT → `/ready` = 503 → пауза `SHUTDOWN_DRAIN_MS` (production 5 с) →
`httpServer.close` + ожидание in-flight до `SHUTDOWN_INFLIGHT_TIMEOUT_MS`, затем обрыв
соединений → `destroy` bootstrappers в обратном порядке (сокеты; pg-boss ждёт
активные задачи до `JOBS_SHUTDOWN_TIMEOUT_MS`) → `EventBus.clear()` → монитор БД →
`dataSource.destroy`. Общий предел — `SHUTDOWN_TIMEOUT_MS`, затем `exit(1)`.
`uncaughtException` → остановка; `unhandledRejection` → лог и Sentry.

## Bootstrappers

| Bootstrapper      | Модуль | Что делает                                                                      |
| ----------------- | ------ | ------------------------------------------------------------------------------- |
| `AdminBootstrap`  | user   | администратор из `ADMIN_EMAIL`/`ADMIN_PASSWORD`, засев прав ролей (некритичный) |
| `SeedBootstrap`   | user   | демо-пользователи в development (некритичный)                                   |
| `JobsBootstrap`   | jobs   | pg-boss: очереди, воркеры и cron по роли процесса (критичный)                   |
| `SocketBootstrap` | socket | Socket.IO-сервер; на `worker` — только слушатели событий                        |

## Реестры расширения

Модуль расширяет ядро, регистрируя реализацию токена в своём `@Module.providers`.

| Токен (где объявлен)                                                              | Хелпер                                                   | Реализации в проекте                                                                           |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SECURITY_SCHEME` (`core/auth/security-scheme.ts`)                                | `asSecurityScheme`                                       | `JwtSecurityScheme` (core), `ApiKeySecurityScheme` (api-key)                                   |
| `JOB_HANDLER` (`core/jobs/jobs.types.ts`)                                         | `asJobHandler`                                           | задачи mailer, file, session, otp, passkeys, audit ([domain/modules](../60-domain/modules.md)) |
| `JOB_METRICS` (`core/jobs`, optional)                                             | `{ provide }`                                            | prom-client (observability)                                                                    |
| `HEALTH_INDICATOR` (`core/observability/health.ts`)                               | `asHealthIndicator`                                      | `JobsHealthIndicator` (`jobs`)                                                                 |
| `ROUTE_PROVIDER` (`core/routing/route-provider.ts`)                               | `{ provide }`                                            | `/files/*` (storage)                                                                           |
| `RAW_HTTP_HANDLER` (`core/routing/raw-http.ts`)                                   | `{ provide }`                                            | нет (сырой обработчик до CORS, лимита и bodyParser)                                            |
| `BOOTSTRAP` (`core/bootstrap`)                                                    | `@Module({ bootstrappers })`                             | см. выше                                                                                       |
| `GRANT_RESOLVER` (`core/auth/access.ts`)                                          | `asGrantResolver`                                        | `UserGrantResolver` (user) → `AccessService` ядра                                              |
| `SOCKET_HANDLER` / `SOCKET_EVENT_LISTENER` (socket)                               | `asSocketHandler` / `asSocketListener` или `{ provide }` | handlers — profile; listeners — auth, user, role, profile, session, file, api-key, audit       |
| `SOCKET_ROOM_POLICY` / `SOCKET_ROOM_PROVIDER` (socket)                            | `asSocketRoomPolicy` / `asSocketRoomProvider`            | policy — `users`, `roles`, `api-keys`, `audit`; provider — нет                                 |
| `PRESENCE_STORE` (socket, optional)                                               | `{ provide }`                                            | нет (по умолчанию Redis или память; подмена в тестах)                                          |
| `PASSWORD_POLICY` (`modules/user/password-policy.ts`)                             | `asPasswordPolicy`                                       | `AuthPasswordPolicy` (auth)                                                                    |
| `FILE_USAGE_PROBE` (`modules/file/file-usage.probe.ts`)                           | `asFileUsageProbe`                                       | `ProfileAvatarUsageProbe` (profile)                                                            |
| `CONTACT_RELATION` / `PRESENCE_AUDIENCE` (`modules/profile/profile.relations.ts`) | `asContactRelation` / `asPresenceAudience`               | нет                                                                                            |
| реестр прав (`modules/permission/permission.registry.ts`)                         | `definePermissions`                                      | `*.permissions.ts`: user, role, profile, api-key, audit, file                                  |
| конфиг модуля (`src/config.ts`)                                                   | `defineModuleConfig`                                     | нет                                                                                            |
| правила загрузки (`modules/file/file-upload.policy.ts`)                           | `defineUploadRules`                                      | нет (базовый белый список — в самом file)                                                      |
| шаблоны писем (`modules/mailer/mailer.types.ts`)                                  | `declare module` → `IMailTemplateData`                   | базовые шаблоны mailer                                                                         |
| события сокета (`modules/socket/socket.types.ts`)                                 | `declare module` → `ISocketEvents`/`ISocketEmitEvents`   | `*.socket-events.ts` 8 модулей ([domain/realtime](../60-domain/realtime.md))                   |

Ядро (`src/core`, `src/types`) не импортирует модули — страж
`src/core/auth/core-boundaries.test.ts`. Схема аутентификации без регистрации в
`SECURITY_SCHEME` → 500 на маршруте. Как пользоваться реестрами —
[recipes](recipes.md).
