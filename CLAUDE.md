# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Detailed Documentation

Подробная документация в `.claude/memory/` — при необходимости глубокого анализа читай эти файлы:
- `.claude/memory/project_architecture.md` — bootstrap flow, module system, IoC binding, все decorators, middleware stack, guards, EventBus, config, build
- `.claude/memory/project_access_control.md` — JWT auth flow, RBAC+Permission модель, wildcard hierarchy, @Security syntax, AdminBootstrap
- `.claude/memory/project_modules.md` — все 21 модуль: entities с полями и связями, все endpoints с security, services, DTOs, validation schemas, socket integration
- `.claude/memory/project_patterns.md` — паттерны кода (controller/service/dto/repository/validation/socket event), checklist нового модуля, правила которые нельзя нарушать

## Workflow

При получении любой задачи (фича, баг, рефакторинг) — следуй этому процессу:

### 1. Анализ
- Прочитай `.claude/memory/` файлы, релевантные задаче (не нужно каждый раз исследовать весь проект)
- Прочитай конкретные файлы кода, которые будут затронуты
- Определи scope затрагиваемых модулей и файлов
- Выяви потенциальные риски и edge cases

### 2. План
- Войди в plan mode и составь пошаговый план с конкретными файлами и изменениями
- Разбей на мелкие итерации (каждая — рабочее состояние, не ломает существующее)
- Покажи план пользователю, дождись подтверждения

### 3. Выполнение
- Выполняй по одной итерации за раз
- После каждой итерации: проверь lint (`yarn lint`), убедись что код компилируется
- Не переходи к следующей итерации пока текущая не завершена и стабильна
- Сообщай прогресс: что сделано, что дальше

### 4. Проверка
- После всех итераций: `yarn lint`, `yarn build`
- Проверь что `yarn generate` не сломал routes.ts
- Кратко резюмируй что было сделано

## Commands

```bash
# Development
yarn dev                  # Hot reload + auto-generates tsoa routes
yarn dev:types            # Watch TypeScript type checking (no emit)

# Build & Production
yarn build                # Generate routes + Rollup build → build/
yarn server               # Run production build

# Code Quality
yarn lint                 # ESLint check
yarn lint:fix             # ESLint auto-fix
yarn prettier:fix         # Prettier format

# Testing
yarn test                 # Mocha (src/**/*.test.ts) with ts-node

# Route/Swagger Generation (runs automatically in yarn dev)
yarn generate             # tsoa routes + swagger.json

# Database Migrations
yarn migration:generate   # Generate migration from entity changes
yarn migration:run        # Apply pending migrations
yarn migration:revert     # Rollback last migration
```

## Architecture

### Stack
Koa + tsoa (REST) + inversify (IoC/DI) + TypeORM (PostgreSQL) + Socket.IO

### Bootstrap Flow
`src/main.ts` → `new App().start(AppModule)` → `src/app.ts`:
1. `registerCoreBindings()` — binds infrastructure (DataSource, EventBus, etc.)
2. `ModuleLoader.load(AppModule)` — walks `@Module` tree recursively, binds all providers/bootstrappers
3. Middleware stack registered
4. tsoa-generated routes registered (`src/routing/routes.ts` — **do NOT edit manually**)
5. Bootstrappers run (`IBootstrap.initialize()`)
6. Server listens; SIGTERM/SIGINT triggers graceful shutdown

### Module System
Modules are the source of truth for IoC registration:

```typescript
@Module({
  imports: [OtherModule],
  providers: [Repository, Service, Controller],  // Controllers must be here — tsoa requires IoC bind
  bootstrappers: [SomeBootstrap],
})
export class FeatureModule {}
```

`@Injectable()` is only a marker (`reflect-metadata`). It does NOT register with the container — registration happens exclusively through `@Module.providers`.

Exception: `@InjectableRepository(Entity)` auto-binds via `toDynamicValue(DataSource.getRepository(Entity))`.

### Feature Module Layout
```
src/modules/feature/
├── feature.entity.ts        # TypeORM @Entity
├── feature.repository.ts    # @InjectableRepository(Entity), extends BaseRepository
├── feature.service.ts       # @Injectable, business logic, emits domain events
├── feature.controller.ts    # @Injectable, tsoa @Route/@Get/@Post etc.
├── feature.dto.ts           # DTOs with static fromEntity()
├── feature.module.ts        # @Module declaration
└── events/                  # Domain events (optional)
```

### Routing (tsoa)
- Controllers glob: `src/modules/**/*.*controller.ts`
- Routes output: `src/routing/routes.ts` — auto-generated, never edit
- Auth module: `src/core/auth/koa-authentication.ts`
- IoC container: `src/app.container.ts`
- Security decorator syntax: `@Security("jwt", ["permission:wg:server:view"])` — use permission strings, not role strings (except user-admin endpoints)

### Authentication & Access Control
JWT carries `userId`, `roles[]`, and merged `effectivePermissions[]` (computed at token issue time — no DB hit per request).

- `TokenService.hasPermission()` supports wildcards: `*`, `wg:*`, `wg:server:*`
- Superadmin bypass: role `ADMIN` OR permission `*`
- `AuthContext`: `{ userId, sessionId, roles: string[], permissions: string[], emailVerified }`
- Use `getContextUser(req)` in controllers to get the current user from Koa context

### EventBus
Business services emit domain events via `EventBus` — they must NOT inject `SocketService` directly.

```typescript
this.eventBus.emit(new UserCreatedEvent(user));       // sync, fire-and-forget
this.eventBus.emitAsync(new MessageSentEvent(msg));   // parallel Promise.allSettled
```

Socket event listeners implement `ISocketEventListener` and subscribe in `register()`. They are registered via `SOCKET_EVENT_LISTENER` token in their module.

### Environment Config
Validated with Zod in `src/config.ts`. Reads from `.env.{NODE_ENV}` or `.env`.

### Build
Rollup with `preserveModules` (required for TypeORM entity discovery). No minification — terser is intentionally disabled (class/function names must be preserved for TypeORM metadata).

### Health Endpoints
- `GET /ping` — server time
- `GET /health` — uptime, DB status
- `GET /api-docs` — Swagger UI
