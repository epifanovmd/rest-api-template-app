# Architecture Guide

## Stack
- **Koa 2** — HTTP framework
- **tsoa** — декларативные контроллеры + авто-генерация routes.ts и Swagger
- **inversify 6** — IoC / Dependency Injection
- **TypeORM 0.3** — ORM + PostgreSQL
- **Socket.IO 4** — real-time
- **pino** — structured logging

---

## Module System

Вдохновлён NestJS, реализован нативно.

### `@Module(options)`

```typescript
@Module({
  imports: [OtherModule],           // импортируемые модули (depth-first, без дублей)
  providers: [MyService, MyCtrl],   // классы → bind().toSelf().inSingletonScope()
  bootstrappers: [MyBootstrap],     // IBootstrap → bind к BOOTSTRAP символу
})
export class MyModule {}
```

**providers** могут быть двух форм:
```typescript
// Класс (bind к самому себе)
providers: [AuthService]

// Token-binding (multi-inject, интерфейс-привязка)
providers: [
  { provide: SOCKET_HANDLER, useClass: DialogSocketHandler },
  { provide: SOCKET_EVENT_LISTENER, useClass: DialogSocketEventHandler },
]
```

### `ModuleLoader`

`ModuleLoader` обходит дерево модулей начиная с root и:
1. Рекурсивно загружает `imports` (depth-first, каждый модуль ровно один раз)
2. Биндит `providers` в IoC контейнер
3. Биндит `bootstrappers` к символу `BOOTSTRAP`

### `@Injectable()`

Маркирует класс как injectable для inversify (`@injectable()` из inversify).
**Не** выполняет автоматической регистрации в контейнере — это задача `@Module`.

```typescript
@Injectable()
export class UserService {
  constructor(@inject(UserRepository) private repo: UserRepository) {}
}
```

### `@InjectableRepository(Entity)`

Маркирует и **авто-биндит** репозиторий через `toDynamicValue` (нужен DataSource).
Репозитории не нужно перечислять в `providers` модуля.

```typescript
@InjectableRepository(User)
export class UserRepository extends BaseRepository<User> {}
```

---

## Startup Flow

```
main.ts
  └── new App().start(AppModule)
        ├── registerCoreBindings()         # DataSource, Koa, decorate Controller
        ├── ModuleLoader.load(AppModule)   # обход дерева модулей, bind all
        ├── configureMiddleware()          # Koa middleware stack
        ├── configureRoutes()             # tsoa RegisterRoutes + /ping /health
        ├── runBootstrappers()            # IBootstrap.initialize() по порядку
        └── listen()                      # HTTP server
```

**Bootstrap порядок** определяется порядком `imports` в `AppModule`:
1. `DatabaseModule` → `DatabaseBootstrap` (TypeORM DataSource)
2. `AuthModule` → `AdminBootstrap` (создание admin-пользователя)
3. `SocketModule` → `SocketBootstrap` (Socket.IO сервер)

---

## Module Tree

```
AppModule
├── CoreModule               # EventBus, LoggerService, TokenVerification
├── DatabaseModule           # bootstrapper: DatabaseBootstrap
├── MailerModule             # MailerService
├── UtilsModule              # UtilsService
├── OtpModule                # OtpService
├── ResetPasswordTokensModule
├── UserModule               # UserService, UserController
├── ProfileModule            # ProfileService, ProfileController
├── FileModule               # FileService, FileController
├── AuthModule               # AuthService, AuthController, bootstrapper: AdminBootstrap
├── BiometricModule          # BiometricService, BiometricController
├── PasskeysModule           # PasskeysService, PasskeysController
├── FcmTokenModule           # FcmTokenService, FcmTokenController
│                            # + { SOCKET_EVENT_LISTENER → PushNotificationListener }
├── DialogModule             # DialogService, DialogController, DialogMembersService,
│                            #   DialogMessagesService
│                            # + { SOCKET_HANDLER → DialogSocketHandler }
│                            # + { SOCKET_EVENT_LISTENER → DialogSocketEventHandler }
│                            # + { SOCKET_EVENT_LISTENER → DialogRoomManager }
└── SocketModule             # SocketServerService, SocketAuthMiddleware,
                             #   SocketClientRegistry, SocketEmitterService
                             # bootstrapper: SocketBootstrap
```

---

## Socket Architecture

### Роли

| Интерфейс | Символ | Назначение |
|-----------|--------|-----------|
| `ISocketHandler` | `SOCKET_HANDLER` | Обрабатывает входящие socket-события при подключении |
| `ISocketEventListener` | `SOCKET_EVENT_LISTENER` | Подписывается на EventBus, шлёт socket/push-уведомления |

### Регистрация нового socket-хендлера

```typescript
// my-feature.module.ts
@Module({
  providers: [
    { provide: SOCKET_HANDLER, useClass: MyFeatureSocketHandler },
  ],
})
export class MyFeatureModule {}
```

`SocketBootstrap` через `@multiInject(SOCKET_HANDLER)` автоматически получит все хендлеры.

### Регистрация нового EventBus-слушателя

```typescript
// my-feature.module.ts
@Module({
  providers: [
    { provide: SOCKET_EVENT_LISTENER, useClass: MyEventListener },
  ],
})
export class MyFeatureModule {}
```

`SocketBootstrap` вызовет `listener.register()` при старте.

---

## Domain Events

Сервисы эмитят события в `EventBus`, **не** инжектируют SocketService.
Это обеспечивает развязку: business logic → domain event → socket/push.

```typescript
// dialog.service.ts
this.eventBus.emit(new MessageCreatedEvent(dto, recipientIds));

// dialog-socket-event.handler.ts (ISocketEventListener)
register(): void {
  this.eventBus.on(MessageCreatedEvent, e => this.onMessageCreated(e));
}
```

---

## Naming Conventions

| Тип | Суффикс | Пример |
|-----|---------|--------|
| HTTP Controller | `.controller.ts` | `user.controller.ts` |
| Business Service | `.service.ts` | `user.service.ts` |
| Repository | `.repository.ts` | `user.repository.ts` |
| Entity (TypeORM) | `.entity.ts` | `user.entity.ts` |
| DTO | `.dto.ts` | `user.dto.ts` |
| Module | `.module.ts` | `user.module.ts` |
| Bootstrap | `.bootstrap.ts` | `database.bootstrap.ts` |
| Domain Event | `.event.ts` | `message-created.event.ts` |
| Socket Handler | `-socket.handler.ts` | `dialog-socket.handler.ts` |
| Event Listener | `-socket-event.handler.ts` / `.listener.ts` | `push-notification.listener.ts` |

---

## Adding a New Module

1. Создай директорию `src/modules/my-feature/`
2. Создай `my-feature.entity.ts`, `my-feature.repository.ts` (`@InjectableRepository`), `my-feature.service.ts` (`@Injectable`), `my-feature.controller.ts`, `my-feature.dto.ts`
3. Создай `my-feature.module.ts`:
   ```typescript
   @Module({
     providers: [MyFeatureService, MyFeatureController],
   })
   export class MyFeatureModule {}
   ```
4. Добавь `MyFeatureModule` в `imports` `AppModule`
5. Запусти `yarn generate` для обновления routes.ts и Swagger

---

## Middleware Stack (порядок)

1. `requestIdMiddleware` — X-Request-ID
2. `errorMiddleware` — глобальный обработчик ошибок
3. `requestLoggerMiddleware` — логирование запросов
4. `corsMiddleware` — CORS
5. `rateLimitMiddleware` — rate limiting
6. `bodyParserMiddleware` — JSON body
7. `helmetMiddleware` — security headers

---

## Authentication

- HTTP: `@Security("jwt")` на методе контроллера → tsoa вызывает `koaAuthentication()` → `TokenVerification.verifyAuthToken()`
- Socket: `SocketAuthMiddleware` проверяет `socket.handshake.auth.token` перед подключением
- SecurityScopes: `role:ADMIN`, `role:USER`, `permission:READ`, `permission:WRITE`
