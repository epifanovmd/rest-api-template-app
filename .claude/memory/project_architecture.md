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
4. `configureMiddleware()` — 9 middleware по порядку
5. `configureRoutes()` — tsoa routes + swagger UI + system routes
6. `runBootstrappers()` — AdminBootstrap → SocketBootstrap
7. `listen()` — HTTP server на config.server.port

Graceful shutdown: SIGTERM/SIGINT → 30s timeout → process.exit

## Module System

```typescript
@Module({
  imports: [OtherModule],
  providers: [Repository, Service, Controller],
  bootstrappers: [SomeBootstrap],
})
export class FeatureModule {}
```

`@Injectable()` — только маркер (reflect-metadata). Регистрация ТОЛЬКО через `@Module.providers`.
`@InjectableRepository(Entity)` — auto-bind через `toDynamicValue(DataSource.getRepository(Entity))`.

## Порядок модулей (src/app.module.ts)

CoreModule → MailerModule → OtpModule → ResetPasswordTokensModule → UserModule → ProfileModule → FileModule → AuthModule → BiometricModule → PasskeysModule → EncryptionModule → LinkPreviewModule → ContactModule → ChatModule → ChatModerationModule → MessageModule → PollModule → StickerModule → CallModule → BotModule → PushModule → SessionModule → SyncModule → SocketModule (последний)

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

## Authentication

**JWT flow:** signIn → TokenService.issue(user) → accessToken + refreshToken. Access: 15min (prod) / 1d (dev). Refresh: 7d.

**Payload:** `{ userId, roles[], permissions[], emailVerified }`

**2FA flow:** signIn → если twoFactorHash → return `{ require2FA, twoFactorToken, hint }` → verify-2fa → tokens

**Security schemes:**
- `@Security("jwt")` — Bearer token из Authorization header
- `@Security("jwt", ["role:admin"])` — role check
- `@Security("jwt", ["permission:chat:view"])` — permission check
- `@Security("bot")` — Bot token из `Authorization: Bot <token>` или `X-Bot-Token`

**Permission wildcards:** `*` → all, `chat:*` → `chat:view` + `chat:manage`. Superadmin bypass: role ADMIN или permission `*`.

**AuthContext:** `{ userId, roles: ERole[], permissions: string[], emailVerified: boolean }`

## EventBus

```typescript
this.eventBus.emit(new UserCreatedEvent(user));       // sync
this.eventBus.emitAsync(new MessageSentEvent(msg));   // async Promise.allSettled
```

Socket listeners: `ISocketEventListener.register()` → подписка на EventBus → emit через SocketEmitterService.
Socket handlers: `ISocketHandler.onConnection(socket)` → socket.on() для client events.
Регистрация: `asSocketHandler(cls)` / `asSocketListener(cls)` в @Module.

## Bootstrap Tasks

1. **AdminBootstrap** (user) — seed admin user + default role permissions
3. **SocketBootstrap** (socket) — auth middleware → on(connection) → handlers → listeners

## Config (src/config.ts)

Zod validated. Reads `.env.{NODE_ENV}` or `.env`.

Ключевые переменные: SERVER_PORT/HOST, JWT_SECRET_KEY, ADMIN_EMAIL/PASSWORD, POSTGRES_*, SMTP_*, FIREBASE_SERVICE_ACCOUNT_PATH, WEB_AUTHN_*, CORS_ALLOW_IPS, RATE_LIMIT_*

## Build

Rollup с `preserveModules` (TypeORM entity discovery). Без минификации (class/function names preserved).

## Тестирование

738 тестов, Mocha + Chai + Sinon, tsx loader. Команда: `yarn test`. Config: `.mocharc.yml`.

## Health Endpoints

- `GET /ping` — server time
- `GET /health` — uptime, DB status
- `GET /api-docs` — Swagger UI
