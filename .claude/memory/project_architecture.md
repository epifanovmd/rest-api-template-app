---
name: Core Architecture (факты)
description: Точная файловая карта ядра main — bootstrap order в app.ts, роли процесса, реестры и точки расширения, декораторы, middleware, guards, EventBus, socket-инфраструктура, config-секции и defineModuleConfig, базовая миграция, тесты (юнит + e2e), build/CI/deploy. Общие принципы — в ARCHITECTURE.md
type: project
---

Общие принципы (слои, границы, события, доступ, задачи, файлы) — в корневом `ARCHITECTURE.md`.
Здесь — только проверенная конкретика main (сверено с кодом 25.09.2026, после выделения веток-примеров).

## Bootstrap (`src/main.ts` → `new App({ rootModule, dataSource }).start()`)

`main.ts` первой строкой импортирует `core/observability/instrument` (Sentry до загрузки
остальных модулей), затем берёт `AppDataSource` (default-экспорт `src/data-source.ts`:
`createDataSource` из `core/db`, сущности — `collectEntities(AppModule)`, миграции —
`src/migrations/index.ts`). Тот же файл — `-d` для CLI TypeORM (ровно один экспорт DataSource).

1. `registerCoreBindings()` — `DataSource`, `Koa`, `HttpServer`; `koa.proxy = config.server.trustProxy`.
2. `metricsMiddleware` (первым) → `RegisterBaseMiddlewares` (requestId → requestLogger → error) →
   системные маршруты (`routing/system-routes.ts`: `/ping`, `/ready`, `/health`, `/metrics`) →
   `RegisterAppMiddlewares` (helmet → cors → rateLimit → bodyParser).
3. `listen()` — HTTP поднят до БД; ошибка `listen` отклоняет промис.
4. `connectDatabase()` — бесконечный retry, backoff 1s → 30s.
5. `applyMigrations()` — `runMigrations` (`core/db/migrations.ts`, `pg_advisory_lock(7268650001)`,
   `transaction: "each"`); при `DB_MIGRATIONS_RUN=false` ожидающие миграции → ошибка запуска
   (в compose так и есть: схему применяет только сервис `migrate`).
6. `DbHealthMonitor.start()` (`core/db/health-monitor.ts`): `SELECT 1` с таймаутом 2 с раз в 10 с.
7. `ModuleLoader.load` → `configureAppRoutes` **только если `APP_ROLE !== "worker"`** (swagger при
   `docsEnabled`, tsoa `RegisterRoutes` с multer, все `ROUTE_PROVIDER`, `notFoundMiddleware`).
8. `runBootstrappers()` — некритичный объявляет `readonly critical = false`; `JobsBootstrap` — critical.
9. `isReady = _isReady && dbHealth.isHealthy`.

Остановка (`App.stop`, идемпотентна): `_isReady=false` → `sleep(shutdown.drainMs)` (prod 5 с) →
`httpServer.close` + `closeIdleConnections`, ждём in-flight до `inflightTimeoutMs`, потом
`closeAllConnections` → bootstrappers `destroy` в обратном порядке (сокеты, pg-boss ждёт активные
задачи до `JOBS_SHUTDOWN_TIMEOUT_MS`) → `EventBus.clear()` (в `App.shutdown`) → `dbHealth.stop` →
`dataSource.destroy`. `main.ts`: общий предел `shutdown.timeoutMs`, `uncaughtException` → shutdown,
`unhandledRejection` → лог + `reportProcessError`; перед `process.exit` — `flushErrors()`. `SocketServerService.close` терпит `ERR_SERVER_NOT_RUNNING`.

## Роли процесса (`APP_ROLE`, `config.app.role`, по умолчанию `all`)

| Роль     | tsoa-маршруты | Клиентские сокеты                                   | Очередь                                     |
| -------- | ------------- | --------------------------------------------------- | ------------------------------------------- |
| `api`    | да            | да                                                  | `createQueue` + постановка (без `work`)     |
| `worker` | нет (пробы)   | нет: `SocketBootstrap` только `registerListeners()` | `work` Node-очередей, cron, watcher, reaper |
| `all`    | да            | да                                                  | всё                                         |

`isJobsWorkerRole()` (`modules/jobs/pg-boss.service.ts`) = `role !== "api"`. Воркер шлёт события
клиентам через Redis-адаптер Socket.IO (`socket-server.service.ts`, `createAdapter(pub, sub)`).

## Реестры расширения (токен → хелпер → кто регистрирует)

| Токен (файл)                                                       | Хелпер                                        | Реализации                                                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `SECURITY_SCHEME` (`core/auth/security-scheme.ts`)                 | `asSecurityScheme`                            | `JwtSecurityScheme` (CoreModule), `ApiKeySecurityScheme` (api-key); `BotSecurityScheme` — в `example/messenger` |
| `JOB_HANDLER` (`core/jobs/jobs.types.ts`)                          | `asJobHandler` / `asExternalJobHandler`       | см. project_modules.md «Очереди»                                                                                |
| `JOB_ACCESS_POLICY` (`core/jobs`, optional)                        | `asJobAccessPolicy`                           | в main никто (`WorkspaceJobAccessPolicy` — `example/workspaces`)                                                |
| `JOB_METRICS` (`core/jobs`, optional)                              | `{ provide }`                                 | `PrometheusJobMetrics` (ObservabilityModule)                                                                    |
| `ROUTE_PROVIDER` (`core/routing/route-provider.ts`)                | `{ provide }`                                 | `StorageRouteProvider` (`/files/*`)                                                                             |
| `HEALTH_INDICATOR` (`core/observability/health.ts`)                | `asHealthIndicator`                           | `JobsHealthIndicator` (jobs, `name = "jobs"`, pg-boss запущен)                                                  |
| `BOOTSTRAP` (`core/bootstrap`)                                     | `@Module.bootstrappers`                       | Admin, Seed (user), Jobs, Socket                                                                                |
| `SOCKET_HANDLER` / `SOCKET_EVENT_LISTENER` (socket)                | `asSocketHandler` / `asSocketListener`        | profile (handlers), auth, user, role, profile, session, file, api-key, audit, jobs (listeners)                  |
| `SOCKET_ROOM_PROVIDER` / `SOCKET_ROOM_POLICY` (`socket-rooms.ts`)  | `asSocketRoomProvider` / `asSocketRoomPolicy` | provider: в main никто; policy: `JobRoomPolicy` (`job`), `permissionRoomPolicy`: users, roles, api-keys, audit  |
| `PASSWORD_POLICY` (`modules/user/password-policy.ts`)              | `asPasswordPolicy`                            | `AuthPasswordPolicy` (auth)                                                                                     |
| `FILE_USAGE_PROBE` (`modules/file/file-usage.probe.ts`, optional)  | `{ provide }`                                 | в main никто (`MessageFileUsageProbe` — `example/messenger`)                                                    |
| `CONTACT_RELATION` (`modules/profile/profile.relations.ts`, opt.)  | `asContactRelation`                           | в main никто (contact — `example/messenger`)                                                                    |
| `PRESENCE_AUDIENCE` (`modules/profile/profile.relations.ts`, opt.) | `asPresenceAudience`                          | в main никто (contact, chat — `example/messenger`)                                                              |
| реестр прав (`modules/permission/permission.registry.ts`)          | `definePermissions(domain, group, {...})`     | `<module>.permissions.ts`: api-key, audit, jobs, profile, role, user                                            |
| `GRANT_RESOLVER` (`core/auth/access.ts`)                           | `asGrantResolver`                             | `UserGrantResolver` (user) → `AccessService` ядра (права по userId, без кэша)                                   |
| конфиг модуля (`src/config.ts`)                                    | `defineModuleConfig(section, schema, values)` | в main никто (`<feature>.config.ts` в ветках-примерах)                                                          |
| шаблоны писем (`modules/mailer/mailer.types.ts`)                   | `declare module` → `IMailTemplateData`        | базовые шаблоны объявлены в самом mailer                                                                        |
| сокет-события (`modules/socket/socket.types.ts`)                   | `declare module` → `ISocketEvents/EmitEvents` | `*.socket-events.ts`: auth, user, role, profile, session, file, api-key, audit, jobs                            |
| `PRESENCE_STORE` (socket, optional)                                | `{ provide }`                                 | подмена в тестах; по умолчанию Redis/Memory                                                                     |

Как пользоваться последними пятью — project_patterns.md «Точки расширения для модулей».
Страж границ — `src/core/auth/core-boundaries.test.ts` (`src/core/**`, `src/types/**` → `src/modules/**` запрещено).
`koa-authentication.ts` — только диспетчер по имени схемы (кэш карты, `resetSecuritySchemes()` для тестов),
незарегистрированная схема → 500. Схемы также описаны в `tsoa.json → securityDefinitions` (`jwt`, `apiKey`;
`bot` добавляет ветка `example/messenger`).

## Пути и ассеты

`core/paths.ts`: `PROJECT_ROOT` (= `__dirname/../..`, одинаково для `src/core` и `build/core`),
`TEMPLATES_DIR` (`templates/`), `resolveFromRoot`. `.env*`, `STORAGE_LOCAL_PATH` (и пути в конфигах модулей,
например ключ Firebase в `example/messenger`) — от корня проекта, не от cwd. Шаблоны писем — `templates/mail/<locale>/<name>{.ejs,.txt.ejs,.subject.ejs}`
(+ `footer.txt.ejs` в локали, общие `templates/mail/layout.ejs`/`layout.txt.ejs`), рендер
`MailRenderer.render(name, locale, data)` с кэшем. Спецификация — `src/routing/swagger.json`
(tsoa `outputDirectory`), импортируется JSON-ом → попадает в build.

## Почта (`modules/mailer`)

`MailerService.send(template, to, data, { locale, manager })` → задача `mail.send` (5 повторов, backoff);
`MailSendJob` → `deliver` (синхронно только там). Без `SMTP_HOST`: production → `send` бросает
`MAIL_NOT_CONFIGURED` (503), задача — `JobError` без повторов; dev/test → письмо в лог. Локали `ru`/`en`
(`resolveMailLocale`, язык — `profile.locale`). Шаблоны main: `otp-code`, `reset-password`, `email-change-code`,
`email-change-notice`; типы данных — `IMailTemplateData` (`mailer.types.ts`), модули дополняют его
`declare module "../mailer/mailer.types"` (так `workspace-invite` в `example/workspaces`). `MAIL_TEMPLATE_NAMES`
нет: `mail-renderer.test.ts` берёт имена из `templates/mail/<locale>/*.subject.ejs`, требует одинаковые наборы во
всех локалях, все три файла и `footer.txt.ejs`. `UserService._sendVerificationCode` отзывает код, если письмо не
встало в очередь. Смена email — `EmailChangeService` (код на новый адрес, `POST user/my/email/confirm`).
Локально Mailpit (`docker-compose.dev.yml`, SMTP :1025, UI :8025); e2e берёт коды/ссылки из Mailpit API.

## Redis и несколько процессов

`core/redis/redis.ts`: `getRedis()` (общий клиент или `undefined` без `REDIS_URL`), `createRedisClient(purpose)`.
В production `REDIS_URL` обязателен (superRefine). Что живёт в Redis (без него — память одного процесса):

- rate limit (`koa-ratelimit` redis-driver, fail-open), `ThrottleGuard` (`core/guards/throttle.store.ts`:
  `RedisThrottleStore` INCR+PTTL / `MemoryThrottleStore`);
- presence: `SocketClientRegistry` (`modules/socket/socket-client-registry.ts`) — локальная карта сокетов
  процесса + `IPresenceStore`: `RedisPresenceStore` (`SET presence:<userId>` из socket id, TTL 60 с,
  heartbeat `touch` раз в 20 с) или `MemoryPresenceStore`; `isOnline`/`filterOnline` — async; `stop()`
  снимает свои записи. Используется только для `isOnline`/`filterOnline` (presence; в `example/messenger` — ещё push офлайн), доставка — комнатами;
- адаптер Socket.IO (`@socket.io/redis-adapter`, pub/sub) — `SocketEmitterService.joinRoom/leaveRoom/
disconnectUser/disconnectSession` работают на всех процессах;
- отзыв access-токенов (`core/auth/session-revocation.ts`: `revoked:session:<id>`, `revoked:user:<id>`);
- попытки входа/2FA (`AuthAttemptsStore`, `modules/auth`).

## Декораторы ядра (`src/core/decorators/`)

| Декоратор                                                  | Файл                          | Что делает                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@Module({ imports, entities, providers, bootstrappers })` | `module.decorator.ts`         | пишет metadata `module:metadata`; `TokenProvider = { provide, useClass }`                                                                           |
| `@Injectable()`                                            | `injectable.decorator.ts`     | = inversify `injectable()`, маркер                                                                                                                  |
| `@InjectableRepository(Entity)`                            | `repository.decoration.ts`    | metadata `repository:entity`; ModuleLoader биндит `toDynamicValue(new Repo(DataSource, entity))`                                                    |
| `@ValidateBody/Query/Params(schema)`                       | `zod-validation.decorator.ts` | tsoa `Middlewares`; `safeParseAsync`, ошибки → `ValidationException` (400 `VALIDATION_ERROR`, `details` путь → сообщение); результат подменяет вход |
| `@UseGuards(...guards)`                                    | `guard.decorator.ts`          | класс или инстанс `IGuard { process(ctx): boolean }`                                                                                                |

`ModuleLoader.ensureInjectable` сам навешивает `injectable()`, если забыли `@Injectable()`.
Все биндинги `inSingletonScope()`; повторный bind класса пропускается (`isBound`).
Доменные декораторы маршрутов живут в модулях (например `@WorkspaceRole` в `example/workspaces`); middleware
tsoa создаётся без DI — сервисы брать из `iocContainer` (`src/app.container`).

## Базовые классы и контракты (`core`)

- `BaseRepository<T>` (`core/repository/repository.ts`): `createAndSave`, `withTransaction(cb(repo, em))`,
  `getRepository(em)`, `createQueryRunner()`.
- `BaseDto` (`core/dto/BaseDto.ts`): конструктор бросает `HttpException 500`, если entity undefined.
- Пагинация (`core/dto/pagination.ts`): `IPaginatedDto<T> { items, total, offset, limit }`,
  `ICursorPageDto<T> { items, nextCursor }`, `normalizePagination(offset, limit)` (умолчание 20, максимум 100),
  `toPage(items, total, p)`, `encodeCursor`/`decodeCursor` (base64url JSON).
- Ошибки: `IErrorResponseDto { status, code, message, details?, requestId?, stack? }` (`core/dto/ErrorResponse.ts`);
  `core/http/exceptions.ts` — `HttpException(message, status, reason?, code?)`, семейство
  `BadRequest…ServiceUnavailableException`, `ValidationException(fields)`, `defineErrors(prefix, defs)` →
  фабрики + `.codes`, `defaultErrorCode(status)`, `HttpStatus`. `UUID` — `core/http/uuid.type.ts`.
- `JobQueue` (абстрактный класс-токен), `IJobHandler`, `JobDefinition`, `JobContext`, `EnqueueOptions`,
  `JobError(code, msg, retryable)`, внешние: `IExternalJobHandler`, `ExternalJobFiles` — `core/jobs/jobs.types.ts`.
- `FileStorage` (абстрактный класс-токен: `put/get/stat/delete/deletePrefix/signedGetUrl/signedPutUrl/withLocalFile`)
  — `core/storage/storage.types.ts`.
- Legacy: `IListResponseDto` (`core/dto/ListResponse.ts`) — нигде не используется, не применять;
  `ApiResponseDto { message?, data? }` — ещё в 4 методах `AuthController`.
- `IBootstrap { initialize(); destroy?(); critical? }`, токен `BOOTSTRAP`.
- `assertNotNull(item, message | HttpException)` (`common/helpers`).

## Middleware (`src/middleware/app.middleware.ts`)

`metricsMiddleware` (`core/observability`) — в `App.start` до всех. `RegisterBaseMiddlewares`: `requestId`
(ALS) → `requestLogger` (slow > 2s warn; `/ping`, `/ready` не логируются) → `error` (ставит `requestId` в тело,
`reportError` для 5xx). `RegisterAppMiddlewares`: `helmet` → `cors` (`isAllowedOrigin` — общая политика с
Socket.IO) → `rateLimit` → `bodyParser`. `notFoundMiddleware` — после роутов. CORS пропускает `X-Request-ID`,
`X-Device-Name`, `X-Device-Type`.

## Guards (`src/core/guards/`)

`ThrottleGuard(limit, windowMs, name?, store?)` — async, ключ `throttle:<name>:<ctx.ip>`, Redis/память;
`RequireVerifiedEmailGuard`, `ApiKeyGuard(key, header)` (статический ключ; сервисные ключи — схема `apiKey`),
`RequireHttpsGuard` (`ctx.secure`), `IpWhitelistGuard(ips[])`. `X-Forwarded-*` — только через `koa.proxy`.

## Auth ядро (`src/core/auth/`)

- `security-scheme.ts` (`ISecurityScheme { name, authenticate(request, scopes) }`), `koa-authentication.ts`
  (диспетчер), `jwt.scheme.ts` (`JwtSecurityScheme`: `Bearer` → `TokenService.verify(token, scopes)`).
- `TokenService` (`token.service.ts`): `issue(subject: TokenSubject, sessionId)`, `verify`/`verifyAccess`
  (+ отзыв, `session-revocation.ts`), `revokeSessions`, `revokeUser`; scopes `SecurityScopes`
  (`permission:<perm>` / `role:<role>`), `types/tsoa.d.ts` типизирует `@Security("jwt", scopes)`.
- `has-permission.ts` (wildcard `a:b:c` → `a:b:*` → `a:*` → `*`, `isSuperUserGrant`), `superuser.ts`
  (`SUPERUSER_ROLE = "admin"`, `ALL_PERMISSIONS = "*"`), `password.ts` (scrypt `scrypt$N$salt$hash`;
  старые bcrypt-хеши `$2…` только проверяются — поэтому пакет `bcrypt` ещё в зависимостях),
  `password-policy.ts`, `token-hash.ts` (sha256), `auth-token.errors.ts`.
- `getContextUser(req: KoaRequest)` (`user-context.ts`) → `AuthContext` или 401.
- `AuthContext { kind?: "user" | "bot" | "service", userId, sessionId, roles: string[], permissions: string[],
emailVerified }` / `KoaRequest` / `JWTDecoded` — `src/types/koa.ts`. Ролей/прав-типов модулей ядро не знает.

## EventBus (`src/core/event-bus/event-bus.ts`)

Ключ — класс события. API: `emit` (sync, ошибки логируются), `emitAsync` (`Promise.allSettled`),
`on` → unsubscribe, `once`, `off`, `clear()` (вызывает `App.shutdown`). Внутрипроцессный: на воркере
слушатели регистрируются тоже (`SocketBootstrap.registerListeners`).

## Socket-инфраструктура (`src/modules/socket/`)

`SocketServerService` (только websocket, Redis-адаптер при `REDIS_URL`), `SocketAuthMiddleware`
(`handshake.auth.token` → `verifyAccess`; `watch(socket)`: `auth:expired { graceMs }` → разрыв через 30 с без
`auth:refresh`), `SocketClientRegistry` (presence, см. Redis), `SocketEmitterService` (`toUser` → room
`user_<id>`, `toRoom`, `broadcast`, `joinRoom/leaveRoom/disconnect*`), `SocketBootstrap`: auth → connection →
`trackSocketConnection` → register presence → join `user_<id>` → `authenticated` → комнаты всех
`SOCKET_ROOM_PROVIDER` → `room:subscribe`/`room:unsubscribe` через `SocketRoomService` по `SOCKET_ROOM_POLICY`
(ack `{ ok }`; подписки в `socket.data.subscriptions`, `revalidateUser` → `room:revoked`) →
`UserOnlineEvent` → `handlers.onConnection` → listeners `register()`. `socket-validation.ts::onValidated`
(схема + token bucket на сокет/событие + ack с кодом). Контракт событий — `socket.types.ts` (только события
соединения) + `<feature>.socket-events.ts` модулей (`declare module "../socket/socket.types"`).
`TInterServerEvents = Record<string, …>` (шаблон их не задаёт). `SocketModule` — последний в `app.module.ts`.
`socket.bootstrap.ts` импортирует `UserOnlineEvent`/`UserOfflineEvent` из `../profile/events`.

## Config (`src/config.ts`)

Zod. `NODE_ENV` по умолчанию **production** (`yarn dev` — development, `yarn test` — test).
`process.loadEnvFile` читает `<root>/.env.${nodeEnv}`, затем `<root>/.env`. Экспорты: `config`, `nodeEnv`,
`isProduction`, `isDevelopment`, `isTest`. Секции: `app.{name, role, publicUrl}`,
`jobs.{concurrency, shutdownTimeoutMs, poolMax}`, `storage.{driver, localPath, signedUrlTtlSeconds,
s3.{bucket, region, endpoint, publicEndpoint, accessKeyId, secretAccessKey, forcePathStyle}}`,
`observability.{metricsEnabled, metricsToken, sentryDsn}`, `server`
(+ `trustProxy`, `docsEnabled`, `docsServers` ← `API_DOCS_SERVERS` csv, `shutdown.*`), `logging`, `redis.url`,
`rateLimit`, `cors.allowedOrigins`, `auth.jwt.{secretKey ≥ 32, accessTtl, refreshTtlDays, refreshCookie}`,
`auth.{admin, otp, resetPassword, webAuthn}`, `database.postgres` (ssl, pool, таймауты, `migrationsRun`),
`email.smtp`. Секций модулей (workspace, firebase) больше нет. `superRefine` в production: пароль БД, не `*` в
CORS, `REDIS_URL`, `S3_BUCKET` + ключи при `STORAGE_DRIVER=s3`. В тестах JWT/admin — `testOnly`.
Экспортируемые хелперы схем: `positiveInt`, `nonNegativeInt`, `port`, `bool(fallback)`, `optionalString`, `csv`;
`defineModuleConfig(section, schema, values)` — `safeParse`, ошибка → `Error("Конфигурация модуля «section»: …")`
(`z.prettifyError`); вызывается при импорте `<feature>.config.ts`, env к этому моменту загружен.
Env: `APP_ROLE`, `APP_PUBLIC_URL`, `JOBS_*`, `STORAGE_*`, `S3_*` (`S3_PUBLIC_ENDPOINT`), `METRICS_*`,
`SENTRY_DSN`, `AUTH_REFRESH_COOKIE`, `API_DOCS_SERVERS`;
полный список — `.env.example`.

## DB

`createDataSource({ entities, migrations })` (`core/db/data-source.ts`): `synchronize: false`,
`applicationName`, `maxQueryExecutionTime` (slow log), pool, `connectionTimeoutMillis`, `statement_timeout`.
Сущности — из `@Module({ entities })`; тест `core/db/entity-registry.test.ts`. Миграции — список
`src/migrations/index.ts`; в main **одна базовая** `InitialSchema1790353961289`
(`src/migrations/1790353961289-InitialSchema.ts`, сгенерирована после разделения, только базовые таблицы: users,
roles, permissions, role_permissions, user_roles, user_permissions, profiles, privacy_settings, files, api_keys,
audit_events, sessions, email_change_requests, otp, reset_password_tokens, biometrics, passkeys,
passkey_challenges, job_runs). **Больше не пересоздаётся**: на неё опираются ветки-примеры, их миграции идут поверх.
Изменение схемы = новая миграция: `yarn migration:generate src/migrations/<Name>` (нужна БД с применёнными
миграциями) → в список.
pg-boss держит свою схему `pgboss` (мигрирует сам). `core/db/pg-errors.ts`: `isUniqueViolation`, `PG_ERROR`,
`pgErrorCode`. Хеши паролей — `text`. Дампы: `core/db/dump/*.sh`.

## Логгер (`src/core/logger/`)

pino: уровень `LOG_LEVEL`, `pino-pretty` только при `LOG_PRETTY`, `base.service = app.name`, `mixin` добавляет
`requestId` из `AsyncLocalStorage` (`request-context.ts`; кладут `requestIdMiddleware` и `JobRunner` —
`job:<queue>:<id>`). `redact` — секретные поля до 4 уровней.

## Тесты

Юнит: Mocha (`.mocharc.yml`: `require: tsx`, `spec: src/**/*.test.ts`, timeout 10s) + Chai + Sinon.
Хелперы `src/test/helpers.ts`: `createMockRepository`, `createMockQueryBuilder`, `createMockEventBus`,
`createMockEmitter`, `createMockEntityManager`, `createMockDataSource`, `uuid/uuid2/uuid3`.
На 25.09.2026 (после разделения): 94 тест-файла, **873 passing, 13 pending** (pending — интеграции без env: `TEST_DATABASE_URL`
для `jobs.integration.test.ts`, `TEST_S3_ENDPOINT` для `s3-file.storage.test.ts`).

E2E: `yarn test:e2e` (`.mocharc.e2e.yml`: `test/e2e/**/*.e2e.ts`, `setup.ts` — корневые хуки, timeout 30s).
`test/e2e/harness.ts` поднимает `src/main.ts` через `tsx` дочерним процессом (`APP_ROLE=all`, свободный порт,
`NODE_ENV=test`), перед этим `DROP/CREATE DATABASE` (имя обязано содержать `e2e|test`) и `FLUSHDB` Redis
(база ≠ 0, по умолчанию `/15`). Env `E2E_*` (Postgres, Redis, SMTP, `E2E_MAILPIT_URL`, `E2E_S3_*`,
`E2E_STORAGE_DRIVER`), умолчания — dev-compose. Файлы: `auth`, `user` (профиль, email, пароль и удаление,
администрирование, сессии, аудит), `agents` (ALP: WS и HTTP sync, задачи, команды, выпуски), `platform` (файлы S3/local, задачи, api-keys,
биометрия/passkeys); ветки-примеры добавляют свои (`messenger.e2e.ts`, блоки в `platform`). `client.ts`
(HTTP-клиент, пишет `calledEndpoints`),
`zz-coverage.e2e.ts` — последний: каждый path+method из `swagger.json` должен быть вызван.

## Build / tooling / deploy

- `tsconfig.build.json`: `rootDir: src`, `outDir: build`. Копирования нет. `yarn server` = `node build/main.js`.
- `tsoa.json`: `outputDirectory: ./src/routing`, `securityDefinitions` jwt/apiKey, `servers` — localhost.
- tsoa 6.6.0 закреплён точно; `@koa/router` 14. Деструктуризация в `@Body()` ломает генерацию.
- `resolutions: { "**/@types/koa": "^3.0.3" }`. ESLint 10 flat + typescript-eslint 8; Prettier 3.
- lefthook pre-commit: prettier (ts/json/md/yml, staged) → eslint --fix (staged `src/**/*.ts`) → typecheck → test.
- `yarn gen:module <name> [--dry-run]` — `scripts/gen-module.mjs`: entity, repository, service, controller, dto,
  validation, errors, events, module, README, тесты; печатает шаги (app.module до SocketModule, generate, миграция).
- `Dockerfile`: стадии deps → builder → prod-deps → `api` (tini, без yarn, `USER node`, `templates/`,
  `VOLUME /app/files`, HEALTHCHECK `/ping`) → `worker` (= api + `ffmpeg`, последняя стадия — дефолт).
  `APP_VERSION` build-arg; стадия `agent-dist` (golang) собирает агент linux/darwin × amd64/arm64 + manifest
  (подпись — секрет BuildKit `agent_signing_key`) в `/app/agent/dist` — их раздаёт API. `Dockerfile.agent` —
  Go-агент (PID 1) + python 3.12-slim с SDK и `examples/`, конфиг `agent/agent.docker.yaml`, том `/var/lib/agent`.
  На машине: `scripts/agent-dev.sh` — `yarn agent:setup` (сборка агента в docker + `.venv`), `yarn agent`
  (конфиг `agent/agent.dev.yaml`, `AGENT_BOOTSTRAP_TOKEN` и `SERVER_PORT` из `ENV_FILE`), фон —
  `agent:start|stop [--force]|status|logs` (`.agent/`, в .gitignore). Go-команды — `scripts/agent.sh`
  (`yarn agent:go test|race|vet|fmt|tidy|build [os] [arch]|release`). Сервер без Docker — `agent/install/install.sh`
  (systemd `agent.service`).
- `docker-compose.yml` (prod, только образы): `migrate` (одноразовый `typeorm migration:run -d build/data-source.js`),
  `api` (`:TAG-api`, `APP_ROLE=api`, масштабируется, `API_PORTS`), `worker` (`:TAG`, `APP_ROLE=worker`), профиль
  `agent` (Dockerfile.agent, том `agent-data`, `AGENT_ENROLL_TOKEN` ← `AGENT_BOOTSTRAP_TOKEN`), `postgres:16`, `redis:7` (без persistence, allkeys-lru), `s3` (SeaweedFS `:8333`) + `s3-init`
  (aws-cli, создаёт bucket). `env_file: ${ENV_FILE:-.env.production}`, `DB_MIGRATIONS_RUN=false`,
  `STORAGE_DRIVER=s3`, `S3_PUBLIC_ENDPOINT` по умолчанию `http://localhost:8333`, `read_only`, `cap_drop: ALL`.
- `docker-compose.dev.yml`: Postgres, Redis, Mailpit (1025/8025), SeaweedFS (8333, `storage`/`storage12345`),
  `s3-init` создаёт bucket-ы `rest-api` и `e2e`.
- `.gitignore`/`.dockerignore`: Python `__pycache__/`, `*.pyc` игнорируются (из git убраны). `firebaseAccount.json`
  (ключ Firebase для `example/messenger`) игнорируется и в main — чтобы локальный ключ не попал в коммит.
- CI `.github/workflows/ci.yml` (push и pull_request в `main`; ветки-примеры CI не запускают): verify (generate + `git diff --exit-code src/routing`, lint, typecheck, test,
  build), migrations (чистый Postgres + дрейф через `migration:generate CiDrift`), e2e (матрица `storage: [s3, local]`,
  SeaweedFS запускается `docker run`), audit (`continue-on-error`), python-sdk, agent (gofmt, vet, `go test -race`
  с `ALP_FIXTURES`), docker (api/worker/agent + Trivy CRITICAL/HIGH, ignore-unfixed). `release.yml`: тег `v*` →
  GHCR, amd64+arm64, worker без суффикса, api `-api`, agent `-agent`; секрет `AGENT_SIGNING_KEY`.
  `deploy.yml`: после Release или вручную — scp `docker-compose.yml`, `pull` → `run --rm migrate` → `up -d`.
  `Makefile`: `deploy` (compose/pull/migrate/up), `env`, `logs`, `backup`, `build`.

## HTTP-поведение (с 25.09.2026)

- Все маршруты модулей — `api/v1/...` (в `swagger.json` нет путей вне `/api/v1`); на всех контроллерах
  `@Response<IErrorResponseDto>("default", "Ошибка")`. Системные `/ping`, `/ready`, `/health`, `/metrics` и
  `/files/*` (storage) — вне версии и вне спецификации.
- tsoa `ValidateError` (типы параметров/тела, `UUID` в path) → 400 `VALIDATION_ERROR`, `details` без префикса
  `body.` — тот же контракт, что у Zod (раньше tsoa давал 422).
- **helmet включён** (`middleware/helmet.middleware.ts`): API — `default-src 'none'`, `frame-ancestors 'none'`,
  CORP `cross-origin` (фронтенд показывает файлы API через `<img>` с другого origin); `/api-docs` — отдельная CSP
  с cdnjs и `'unsafe-inline'` для Swagger UI, **без `upgrade-insecure-requests`** (иначе по http, например с
  LAN-IP, браузер переписывает запросы на https). `servers` спецификации — на запрос (`core/http/docs-servers.ts`,
  `routing/swagger.ts`; см. project_reference.md «Swagger servers»). Health-роуты регистрируются до middleware и заголовков не получают.
- **Rate limit**: `createRateLimitMiddleware({ ...config.rateLimit, redis: getRedis() })`; ошибки хранилища — fail-open,
  ошибки ниже по цепочке пробрасываются (флаг `passed`, иначе «next() called multiple times»).
- **Ошибки загрузки**: `fileFilter` → `UnsupportedMediaTypeException` (415); `MulterError` лимитов → 413, прочие → 400
  с `code` = код multer и `details.field`.
- **PG 22P02** (`invalid_text_representation`, значение не того формата в запросе к БД) → 400 `INVALID_PARAMETER`, SQL наружу не идёт.
- `ThrottleGuard` бросает `TooManyRequestsException` (не `ctx.throw`).
- `App.listen` отклоняет промис на ошибке `listen` (порт занят) — падение идёт через bootstrap и логгер.
- WebAuthn в OpenAPI — свои интерфейсы `modules/passkeys/webauthn.dto.ts` (имена схем те же, что были);
  типы `@simplewebauthn/server` 14 с DOM `BufferSource` tsoa не разбирает. `@simplewebauthn/types` удалён.
- `modules/file/ffmpeg.ts` — `createFfmpeg(exec)`: `probe`/`run`/`decode` через асинхронный `execFile` (ищет в PATH);
  `fluent-ffmpeg` удалён, waveform больше не блокирует event loop (был `spawnSync`).
- UUID: `crypto.randomUUID()` + `isUuid` (`common/helpers/uuid.ts`); пакета `uuid` нет. `moment`, `dotenv` удалены.
- inversify 8 (ESM-only, грузится из CJS через `require(esm)`): `ServiceIdentifier` вместо `interfaces.*`,
  в `toDynamicValue` — `ctx.get(...)`. TypeORM 1.x: `select` — только объектом (`{ id: true }`).

## Общие механизмы ядра

- `core/db/PgSignals<TChannel>` — LISTEN/NOTIFY между процессами: одно соединение на наследника, переподключение раз в 30 с, `isListening`/`onStatus` для перехода на опрос (PgBouncer transaction mode). Модуль наследует со своими каналами и регистрирует в DI (пример — `JobSignals`). NOTIFY с `manager` доходит после коммита.
- `core/crypto/secret-box` — `parseSecretBoxKey` (32 байта hex/base64), `sealSecret`/`openSecret` (AES-256-GCM, формат `v1`): секреты в БД ключом приложения.
- `core/redis/LiveStore(prefix)` — живое состояние с TTL (`getJson`/`setJson`/`delete`/`setIfAbsent`/`incrBy`): Redis, без него — память процесса. Модуль наследует со своим префиксом.
- Socket: `room:subscribe` регистрируется синхронно до первого await в `connection` (иначе подписка сразу после connect/reconnect терялась). e2e сокетов — `test/e2e/socket.ts` (`connectSocket`, `join`, `next`, `none`).
- Makefile: `SSH_OPTS` (таймаут, `ConnectionAttempts`, keepalive) для ssh/scp/rsync.
