---
name: Core Architecture
description: Полная архитектура проекта — bootstrap flow, module system, IoC binding, decorators, middleware, routing, guards, EventBus, config, build, тесты
type: project
---

## Bootstrap Flow

`src/main.ts` → `new App().start(AppModule)` → `src/app.ts`:

1. `initializeDatabase()` — TypeORM connection (3 retry, 2s delay)
2. `registerCoreBindings()` — Controller, DataSource, Koa, HttpServer
3. `loadModules()` — ModuleLoader обходит дерево @Module, регистрирует providers/bootstrappers
4. `configureMiddleware()` — 8 middleware по порядку
5. `configureRoutes()` — tsoa routes + swagger UI + system routes
6. `runBootstrappers()` — AdminBootstrap → SocketBootstrap
7. `listen()` — HTTP server на config.server.port

Graceful shutdown: SIGTERM/SIGINT → 30s timeout → process.exit

## Module System

```typescript
@Module({
  imports: [OtherModule],
  providers: [Repository, Service, Controller,
              asSocketHandler(Handler), asSocketListener(Listener)],
  bootstrappers: [SomeBootstrap],
})
export class FeatureModule {}
```

`@Injectable()` — только маркер (reflect-metadata). Регистрация ТОЛЬКО через `@Module.providers`.
`@InjectableRepository(Entity)` — auto-bind через `toDynamicValue(DataSource.getRepository(Entity))`.

## 21 модуль (CoreModule + 20 feature)

**Порядок в src/app.module.ts:**
CoreModule → MailerModule → OtpModule → ResetPasswordTokensModule → UserModule → ProfileModule → FileModule → AuthModule → BiometricModule → PasskeysModule → ContactModule → ChatModule → ChatModerationModule → MessageModule → PollModule → CallModule → BotModule → PushModule → SessionModule → SyncModule → SocketModule (последний)

## Middleware Stack (src/middleware/)

1. RequestId — UUID для каждого запроса
2. Helmet — security headers
3. CORS — whitelist из config + credentials
4. BodyParser — JSON/form parsing
5. RateLimit — 1000 req/15min по IP (koa-ratelimit)
6. RequestLogger — timing + slow request warning (>2s)
7. Error — HttpException → JSON response, 5xx → скрытое сообщение
8. NotFound — 404 fallback

## Guards (src/core/guards/)

| Guard | Описание |
|-------|----------|
| ThrottleGuard(limit, windowMs) | Rate limiting по IP, in-memory Map |
| RequireVerifiedEmailGuard | Требует emailVerified=true в JWT |
| ApiKeyGuard(key, header) | Проверка API-ключа в заголовке (default: x-api-key) |
| RequireHttpsGuard | HTTPS или x-forwarded-proto=https |
| IpWhitelistGuard(ips[]) | Whitelist IP, поддержка x-forwarded-for |

## Routing (tsoa)

- Controllers glob: `src/modules/**/*.*controller.ts`
- Routes output: `src/routing/routes.ts` — **NEVER EDIT**
- Auth: `src/core/auth/koa-authentication.ts` — поддержка "jwt" и "bot" security schemes
- IoC container: `src/app.container.ts`

## Authentication (Session-Bound JWT)

**JWT Payload:** `{ userId, sessionId, roles[], permissions[], emailVerified }`

**Login flow:**
1. signIn → bcrypt verify → [2FA?]
2. SessionService.createSession({userId, refreshToken, ip, userAgent, device})
3. TokenService.issue(user, sessionId) → accessToken(15m prod/1d dev) + refreshToken(7d)
4. SessionService.updateRefreshToken(sessionId, refreshToken)

**Refresh flow:**
1. verifyToken(refreshToken) → extract userId
2. SessionService.findByRefreshToken(token) → если нет → 401
3. issue new tokens с тем же sessionId
4. updateRefreshToken (ротация — старый токен мёртв)

**Session termination:** delete session → refreshToken мёртв при следующем refresh.
**Password change / privileges change:** → PasswordChangedEvent/UserPrivilegesChangedEvent → SessionListener → terminateAllByUser() → все сессии удалены.

**IDeviceInfo:** ip, userAgent, deviceName, deviceType — извлекается из request headers в контроллере.

**2FA flow:** signIn → если twoFactorHash → return `{ require2FA, twoFactorToken(5min), hint }` → verify-2fa(+deviceInfo) → create session → tokens

**Security schemes:**
- `@Security("jwt")` — Bearer token из Authorization header
- `@Security("jwt", ["permission:chat:view"])` — permission check
- `@Security("bot")` — Bot token из `Authorization: Bot <token>` или `X-Bot-Token`

**Permission wildcards:** `*` → all, `chat:*` → `chat:view` + `chat:manage`. Superadmin bypass: role ADMIN или permission `*`.

**AuthContext:** `{ userId, sessionId, roles: string[], permissions: string[], emailVerified: boolean }`

**Roles/Permissions — const объекты (не enums):**
- `Roles` = { ADMIN: "admin", USER: "user", GUEST: "guest" } — тип `TRole`
- `Permissions` = { ALL: "*", USER_VIEW: "user:view", ... } — тип `TPermission`
- Обе системы расширяемы через API без деплоя (произвольные строки)

## EventBus (~48 событий)

```typescript
this.eventBus.emit(new SomeEvent(data));       // sync
this.eventBus.emitAsync(new SomeEvent(data));   // async Promise.allSettled
```

Паттерн: Service emits EventBus event → Listener subscribes → emits socket event via SocketEmitterService.
Регистрация: `asSocketHandler(cls)` / `asSocketListener(cls)` в @Module.

Модули с событиями: auth (3), user (5), contact (5), chat (8 incl. moderation + last-message), message (7), call (5), poll (3), profile (4 incl. presence), encryption (—), session (1), bot (3), file (1), push (1), sync (подписка на ~10 событий).

## Bootstrap Tasks

1. **AdminBootstrap** (user) — seed admin user + default role permissions
2. **SocketBootstrap** (socket) — auth middleware → on(connection) → handlers → listeners → presence

## Transactions

Сервисы используют `DataSource.transaction()` для атомарных операций:
- ContactService: addContact, removeContact
- ChatService: createDirectChat, createGroupChat, joinByInvite
- CallService: initiateCall (с pessimistic locks)
- UserService: createUser
- PollService: vote
- BotService: setCommands

Паттерн: `this._dataSource.transaction(async (manager) => { manager.getRepository(Entity)... })`. Events emit ПОСЛЕ транзакции.

## Config (src/config.ts)

Zod validated. Reads `.env.{NODE_ENV}` or `.env`.

Секции: server (host, port, filesFolderPath, filesRoutePrefix, filesServerPort, publicHost), rateLimit, cors, auth (jwt, admin, otp, resetPassword, webAuthn), database (postgres + poolMax), email (smtp), firebase (serviceAccountPath).

## Build

Rollup с `preserveModules` (TypeORM entity discovery). Без минификации (class/function names preserved). tsconfig.production.json excludes tests.

## Тестирование

~886 тестов, 45 test-файлов. Mocha + Chai + Sinon, tsx loader. Команда: `yarn test`. Config: `.mocharc.yml`.

Test helpers (`src/test/helpers.ts`): createMockRepository, createMockQueryBuilder, createMockEventBus, createMockEmitter, uuid/uuid2/uuid3.

## Health Endpoints

- `GET /ping` — server time
- `GET /health` — uptime, DB status
- `GET /api-docs` — Swagger UI
