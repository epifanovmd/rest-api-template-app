---
name: Core Architecture
description: Полная архитектура проекта — bootstrap flow, module system, IoC binding rules, decorator semantics, middleware stack, routing
type: project
---

## Bootstrap Flow

`src/main.ts` → `new App().start(AppModule)`:

```
1. TypeOrmDataSource.initialize()        — подключение к PostgreSQL
2. registerCoreBindings()                — DataSource, Koa, HttpServer в контейнер
3. ModuleLoader.load(AppModule)          — рекурсивный обход @Module дерева, bind providers
4. RegisterAppMiddlewares()              — middleware stack
5. configureRoutes()                     — system routes + swagger + tsoa routes
6. runBootstrappers()                    — IBootstrap.initialize() последовательно
7. listen()                              — HTTP server start
```

Graceful shutdown: SIGTERM/SIGINT → bootstrappers.destroy() (reverse order) → httpServer.close() → DataSource.destroy()

## Module System

**@Module({ imports, providers, bootstrappers })** — единственный способ регистрации в IoC.

ModuleLoader обходит дерево depth-first с дедупликацией. Три типа binding:

| Тип provider | Как определяется | Как биндится |
|---|---|---|
| `TokenProvider` `{ provide: Symbol, useClass: Class }` | Объект с `provide` + `useClass` | `container.bind(symbol).to(class).inSingletonScope()` |
| `@InjectableRepository(Entity)` | Metadata `REPOSITORY_ENTITY_KEY` | `toDynamicValue(ctx => new Repo(DataSource, Entity))` |
| Обычный класс | Всё остальное | `container.bind(Class).toSelf().inSingletonScope()` |

**Критично:** `@Injectable()` — только маркер для reflect-metadata, НЕ регистрирует в контейнере. Без `@Module.providers` класс не будет доступен через `@inject()`.

## Порядок imports в AppModule

```typescript
@Module({
  imports: [
    // Инфраструктура
    CoreModule,

    // Вспомогательные модули
    MailerModule,
    OtpModule,
    ResetPasswordTokensModule,

    // Модули пользователей / аутентификации
    UserModule,
    ProfileModule,
    FileModule,
    AuthModule,
    BiometricModule,
    PasskeysModule,

    // Мессенджер
    ContactModule,
    ChatModule,
    MessageModule,
    PushModule,

    // Socket — последним
    SocketModule,
  ],
})
```

**Порядок bootstrappers** определяется порядком imports:
1. AdminBootstrap (UserModule) — seed admin user + default permissions
2. SocketBootstrap (SocketModule) — JWT auth middleware, handlers, listeners

## Decorator Reference

| Декоратор | Файл | Назначение |
|---|---|---|
| `@Module(opts)` | `core/decorators/module.decorator.ts` | Объявление модуля (imports, providers, bootstrappers) |
| `@Injectable()` | `core/decorators/injectable.decorator.ts` | Маркер injectable() для inversify |
| `@InjectableRepository(Entity)` | `core/decorators/repository.decoration.ts` | Auto-bind репозитория с Entity через metadata |
| `@UseGuards(...guards)` | `core/decorators/guard.decorator.ts` | Применяет IGuard middleware к методу контроллера |
| `@ValidateBody(schema)` | `core/decorators/zod-validation.decorator.ts` | Zod-валидация request body |
| `@ValidateQuery(schema)` | `core/decorators/zod-validation.decorator.ts` | Zod-валидация query params |
| `@ValidateParams(schema)` | `core/decorators/zod-validation.decorator.ts` | Zod-валидация URL params |

## Middleware Stack (порядок важен)

```
1. requestIdMiddleware       — X-Request-ID (из header или uuid)
2. requestLoggerMiddleware   — pino child logger с requestId, логирует method/url/status/duration
3. errorMiddleware           — catch all → HttpException response (5xx логируется)
4. corsMiddleware            — @koa/cors, whitelist из config.cors.allowedIps
5. rateLimitMiddleware       — koa-ratelimit, in-memory Map, config.rateLimit.*
6. bodyParserMiddleware      — JSON parser
7. helmetMiddleware          — security headers (CSP отключён)
```

## Routing

- tsoa auto-generates `src/routing/routes.ts` из контроллеров `src/modules/**/*.*controller.ts`
- **Никогда не редактировать `routes.ts` вручную** — `yarn generate` для обновления
- Auth module: `src/core/auth/koa-authentication.ts` (tsoa вызывает при @Security)
- IoC module: `src/app.container.ts`
- System routes: `GET /ping`, `GET /health`, `GET /api-docs`

## Guards

| Guard | Тип | Назначение |
|---|---|---|
| `ThrottleGuard(limit, windowMs)` | Factory | Per-IP rate limiting со sliding window, HTTP 429 |
| `RequireVerifiedEmailGuard` | Class | Проверяет `emailVerified` из JWT (без DB) |
| `RequireHttpsGuard` | Class | HTTPS или x-forwarded-proto |
| `IpWhitelistGuard(ips[])` | Factory | Whitelist IP |
| `ApiKeyGuard(key, header?)` | Factory | Проверяет x-api-key header |

## EventBus

```typescript
emit<T>(event: T): void          // sync fire-and-forget (ошибки логируются)
emitAsync<T>(event: T): void     // Promise.allSettled всех handlers
on(EventClass, handler): unsubFn // подписка
once(EventClass, handler): unsubFn
off(EventClass, handler): void
```

**Правило:** Сервисы → EventBus → Listeners. Сервисы НЕ инжектируют SocketService/SocketEmitterService напрямую.

## BaseRepository

```typescript
class BaseRepository<T> extends Repository<T> {
  createAndSave(data)                    // create() + save()
  withTransaction(callback)              // manager.transaction() wrapper
  getRepository(entityManager)           // get repo for transaction context
  createQueryRunner()                    // raw query runner
}
```

## IBootstrap

```typescript
interface IBootstrap {
  initialize(): Promise<void>;   // после routes, перед listen
  destroy?(): Promise<void>;     // при shutdown (reverse order)
}
```

Регистрация: `@Module({ bootstrappers: [MyBootstrap] })` → ModuleLoader биндит как `BOOTSTRAP` symbol multi-inject.

## Config (src/config.ts)

Zod-validated, reads from `.env.{NODE_ENV}` или `.env`:

| Секция | Ключи |
|---|---|
| `server` | publicHost, host, port, filesFolderPath |
| `rateLimit` | limit, intervalMs |
| `cors` | allowedIps[] |
| `auth.jwt` | secretKey |
| `auth.admin` | email, password |
| `auth.otp` | expireMinutes |
| `auth.resetPassword` | expireMinutes, webUrl (template с `{{token}}`) |
| `auth.webAuthn` | rpName, rpHost, rpSchema, rpPort |
| `database.postgres` | host, port, database, username, password, ssl, poolMax, dataPath |
| `email.smtp` | user, pass |
| `firebase` | serviceAccountPath |

## Build

Rollup с `preserveModules: true` + `preserveModulesRoot: "src"` — обязательно для TypeORM entity discovery.
Terser отключён — class/function names нужны для TypeORM metadata и inversify.
Output: CommonJS в `build/`.
