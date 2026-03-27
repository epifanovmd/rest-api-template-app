# Socket Module

Инфраструктурный модуль реального времени на базе **Socket.IO**. Предоставляет WebSocket-сервер с JWT-аутентификацией, реестр подключённых клиентов, типизированный эмиттер событий и точки расширения для других модулей (хендлеры входящих событий и слушатели доменных событий EventBus).

---

## Структура файлов

```
src/modules/socket/
├── index.ts                          # Реэкспорт всех публичных API модуля
├── socket.module.ts                  # Декларация @Module (providers, bootstrappers)
├── socket.bootstrap.ts               # IBootstrap — инициализация сервера при старте приложения
├── socket.types.ts                   # Типизация событий (клиент→сервер, сервер→клиент), TSocket, TServer
├── socket-server.service.ts          # Обёртка над Socket.IO Server (создание, закрытие)
├── socket-auth.middleware.ts         # JWT-аутентификация при подключении
├── socket-client-registry.ts         # Реестр активных соединений (проверка присутствия)
├── socket-emitter.service.ts         # Сервис отправки событий (toUser, toRoom, broadcast)
├── socket-handler.interface.ts       # Интерфейс ISocketHandler + символ SOCKET_HANDLER
├── socket-event-listener.interface.ts # Интерфейс ISocketEventListener + символ SOCKET_EVENT_LISTENER
└── socket.helpers.ts                 # Хелперы asSocketHandler() и asSocketListener() для регистрации в @Module
```

---

## Entity

Модуль не содержит собственных entity. Работает исключительно как инфраструктурный слой транспорта.

---

## Endpoints

Модуль не содержит REST-контроллера. Все взаимодействия происходят через WebSocket-соединение.

---

## Сервисы

### SocketServerService

Инкапсулирует экземпляр `Socket.IO Server` и управляет его жизненным циклом.

| Метод / Свойство | Описание |
|---|---|
| `get io: TServer` | Возвращает экземпляр Socket.IO сервера |
| `close(): Promise<void>` | Останавливает сервер и закрывает все соединения |

Конфигурация сервера:
- CORS: берётся из `config.cors.allowedIps`
- Транспорт: только `websocket` (без long-polling)
- `pingTimeout`: 10000 мс
- `pingInterval`: 25000 мс
- `serveClient`: false (клиентский скрипт не раздаётся)

Зависимости: `HttpServer` (ядро) — HTTP-сервер Koa, к которому подключается Socket.IO.

---

### SocketAuthMiddleware

Middleware для JWT-аутентификации при установке WebSocket-соединения.

| Метод | Описание |
|---|---|
| `handle(socket, next)` | Извлекает JWT из `socket.handshake.auth.token`, верифицирует через `TokenService` и записывает `AuthContext` в `socket.data` |

Логика:
1. Извлекает токен из `socket.handshake.auth.token` (поддерживает формат `Bearer <token>`)
2. При отсутствии токена — `ForbiddenException("Authentication token required")`
3. Верифицирует через `TokenService.verify(token)`
4. При успехе — записывает результат в `socket.data` (тип `AuthContext`: `userId`, `roles`, `permissions`, `emailVerified`)
5. При ошибке — `ForbiddenException` с сообщением об ошибке

Зависимости: `TokenService` (ядро).

---

### SocketClientRegistry

Реестр активных socket-соединений. Поддерживает несколько соединений на одного пользователя (несколько вкладок/устройств).

| Метод | Описание |
|---|---|
| `register(userId, socket)` | Регистрирует соединение для пользователя |
| `unregister(userId, socket)` | Удаляет конкретное соединение; если соединений не осталось — удаляет запись пользователя |
| `isOnline(userId): boolean` | Проверяет, есть ли хотя бы одно активное соединение у пользователя |

Внутренняя структура: `Map<string, Set<TSocket>>` — userId -> множество сокетов.

> Реестр НЕ используется для доставки сообщений (для этого есть Socket.IO rooms `user_${userId}`). Используется исключительно для проверки присутствия (online/offline статус).

---

### SocketEmitterService

Типизированный сервис для отправки Socket.IO событий.

| Метод | Описание |
|---|---|
| `toUser(userId, event, ...args)` | Отправляет событие конкретному пользователю через room `user_${userId}`. Все активные соединения (вкладки/устройства) получат событие |
| `toRoom(room, event, ...args)` | Отправляет событие всем клиентам в указанной комнате (например, `chat_${chatId}`) |
| `broadcast(event, ...args)` | Широковещательная отправка всем подключённым клиентам |

Все методы строго типизированы через `ISocketEmitEvents` — TypeScript не позволит отправить неизвестное событие или передать неправильные аргументы.

Зависимости: `SocketServerService`.

---

## SocketBootstrap

Реализует `IBootstrap` — инициализируется при старте приложения. Управляет полным жизненным циклом WebSocket-сервера.

### Метод `initialize()`

1. **JWT-аутентификация** — подключает `SocketAuthMiddleware` как middleware Socket.IO (`io.use(...)`)
2. **Жизненный цикл соединения** (`io.on("connection")`):
   - Регистрирует соединение в `SocketClientRegistry`
   - Подключает сокет к личной room `user_${userId}` (через неё работает `SocketEmitterService.toUser()`)
   - Отправляет клиенту событие `authenticated` с `userId`
   - Вызывает `onConnection()` у всех зарегистрированных `ISocketHandler` (через `Promise.allSettled`)
   - Подписывается на `error` — логирует и отключает сокет
   - Подписывается на `disconnect` — удаляет соединение из реестра
3. **Регистрация EventBus-слушателей** — вызывает `register()` у всех `ISocketEventListener`

### Метод `destroy()`

1. Очищает все подписки EventBus (`eventBus.clear()`)
2. Закрывает Socket.IO сервер (`serverService.close()`)

Зависимости: `SocketServerService`, `SocketAuthMiddleware`, `SocketClientRegistry`, `EventBus`, все `ISocketHandler` (multi-inject), все `ISocketEventListener` (multi-inject).

---

## DTO

Модуль не определяет собственных DTO. При отправке событий используются DTO из других модулей:

| DTO | Модуль | Используется в событиях |
|---|---|---|
| `MessageDto` | message | `message:new`, `message:updated`, `message:pinned` |
| `ChatDto` | chat | `chat:created`, `chat:updated` |
| `CallDto` | call | `call:incoming`, `call:answered`, `call:declined`, `call:ended`, `call:missed` |
| `PollDto` | poll | `poll:voted`, `poll:closed` |
| `ContactDto` | contact | `contact:request`, `contact:accepted` |
| `PublicProfileDto` | profile | `profile:updated` |

---

## События (Socket.IO)

### Клиент -> Сервер (`ISocketEvents`)

| Событие | Данные | Описание |
|---|---|---|
| `profile:subscribe` | — | Подписка на обновления профиля |
| `chat:join` | `{ chatId }` | Присоединиться к комнате чата |
| `chat:leave` | `{ chatId }` | Покинуть комнату чата |
| `chat:typing` | `{ chatId }` | Индикатор набора текста |
| `message:read` | `{ chatId, messageId }` | Отметить сообщения как прочитанные |
| `message:delivered` | `{ chatId, messageIds[] }` | Подтвердить доставку сообщений |
| `e2e:key-exchange` | `{ chatId, targetUserId, keyBundle }` | Отправить key exchange для E2E шифрования |
| `e2e:ratchet` | `{ chatId, newPublicKey }` | Ratchet step для E2E шифрования |
| `call:offer` | `{ callId, targetUserId, sdp }` | Relay SDP offer (WebRTC) |
| `call:answer` | `{ callId, targetUserId, sdp }` | Relay SDP answer (WebRTC) |
| `call:ice-candidate` | `{ callId, targetUserId, candidate }` | Relay ICE candidate (WebRTC) |
| `call:hangup` | `{ callId, targetUserId }` | Сигнал завершения звонка |

### Сервер -> Клиент (`ISocketEmitEvents`)

#### Аутентификация
| Событие | Данные | Описание |
|---|---|---|
| `authenticated` | `{ userId }` | Успешная аутентификация |
| `auth_error` | `{ message }` | Ошибка аутентификации |

#### Профиль
| Событие | Данные | Описание |
|---|---|---|
| `profile:updated` | `PublicProfileDto` | Изменение профиля |

#### Сообщения
| Событие | Данные | Описание |
|---|---|---|
| `message:new` | `MessageDto` | Новое сообщение |
| `message:updated` | `MessageDto` | Сообщение отредактировано |
| `message:deleted` | `{ messageId, chatId }` | Сообщение удалено |
| `message:reaction` | `{ messageId, chatId, userId, emoji }` | Реакция на сообщение |
| `message:pinned` | `MessageDto` | Сообщение закреплено |
| `message:unpinned` | `{ messageId, chatId }` | Сообщение откреплено |
| `message:status` | `{ messageId, chatId, status }` | Обновление статуса доставки |
| `message:self-destructed` | `{ messageId, chatId }` | Сообщение самоуничтожено |

#### Чаты
| Событие | Данные | Описание |
|---|---|---|
| `chat:created` | `ChatDto` | Новый чат создан |
| `chat:updated` | `ChatDto` | Чат обновлён |
| `chat:typing` | `{ chatId, userId }` | Кто-то набирает текст |
| `chat:unread` | `{ chatId, unreadCount }` | Обновление счётчика непрочитанных |
| `chat:member:joined` | `{ chatId, userId }` | Участник добавлен |
| `chat:member:left` | `{ chatId, userId }` | Участник удалён |
| `chat:pinned` | `{ chatId, isPinned }` | Чат закреплён/откреплён |
| `chat:archived` | `{ chatId, isArchived }` | Чат архивирован/разархивирован |

#### Модерация чатов
| Событие | Данные | Описание |
|---|---|---|
| `chat:slow-mode` | `{ chatId, seconds }` | Режим медленной отправки изменён |
| `chat:member:banned` | `{ chatId, userId, bannedBy, reason? }` | Участник заблокирован |
| `chat:member:unbanned` | `{ chatId, userId }` | Участник разблокирован |

#### Опросы
| Событие | Данные | Описание |
|---|---|---|
| `poll:voted` | `PollDto` | Голос в опросе |
| `poll:closed` | `PollDto` | Опрос закрыт |

#### Звонки (WebRTC)
| Событие | Данные | Описание |
|---|---|---|
| `call:incoming` | `CallDto` | Входящий звонок |
| `call:answered` | `CallDto` | Звонок принят |
| `call:declined` | `CallDto` | Звонок отклонён |
| `call:ended` | `CallDto \| { callId, endedBy }` | Звонок завершён |
| `call:missed` | `CallDto` | Пропущенный звонок |
| `call:offer` | `{ callId, fromUserId, sdp }` | Relay SDP offer |
| `call:answer` | `{ callId, fromUserId, sdp }` | Relay SDP answer |
| `call:ice-candidate` | `{ callId, fromUserId, candidate }` | Relay ICE candidate |

#### E2E Encryption
| Событие | Данные | Описание |
|---|---|---|
| `e2e:key-exchange` | `{ chatId, fromUserId, keyBundle }` | Relay key exchange от другого участника |
| `e2e:ratchet` | `{ chatId, fromUserId, newPublicKey }` | Relay ratchet step |
| `e2e:prekeys-low` | `{ count }` | Предупреждение о малом количестве prekeys |

#### Синхронизация
| Событие | Данные | Описание |
|---|---|---|
| `sync:available` | `{ version }` | Уведомление о наличии новых изменений для sync |

#### Контакты
| Событие | Данные | Описание |
|---|---|---|
| `contact:request` | `ContactDto` | Запрос на добавление в контакты |
| `contact:accepted` | `ContactDto` | Контакт принят |

#### Сессии
| Событие | Данные | Описание |
|---|---|---|
| `session:terminated` | `{ sessionId }` | Сессия завершена |

---

## Точки расширения

### ISocketHandler (SOCKET_HANDLER)

Интерфейс для обработки входящих socket-событий. Каждый хендлер получает сокет при подключении пользователя и может подписаться на клиентские события.

```typescript
export interface ISocketHandler {
  onConnection(socket: TSocket): void | Promise<void>;
}
```

Регистрация в модуле:
```typescript
@Module({
  providers: [asSocketHandler(ChatHandler)],
})
```

### ISocketEventListener (SOCKET_EVENT_LISTENER)

Интерфейс для слушателей доменных событий EventBus, которые транслируют их в socket-события. Метод `register()` вызывается один раз при старте.

```typescript
export interface ISocketEventListener {
  register(): void;
}
```

Регистрация в модуле:
```typescript
@Module({
  providers: [asSocketListener(ChatListener)],
})
```

### Хелперы

| Хелпер | Описание |
|---|---|
| `asSocketHandler(cls)` | Создаёт `TokenProvider` для регистрации `ISocketHandler` в `@Module.providers` |
| `asSocketListener(cls)` | Создаёт `TokenProvider` для регистрации `ISocketEventListener` в `@Module.providers` |

---

## Зависимости

### Зависимости ядра (core)

| Зависимость | Используется в | Назначение |
|---|---|---|
| `HttpServer` | `SocketServerService` | HTTP-сервер для подключения Socket.IO |
| `TokenService` | `SocketAuthMiddleware` | Верификация JWT-токенов |
| `EventBus` | `SocketBootstrap` | Очистка подписок при destroy |
| `Injectable` | Все сервисы | Маркер для DI |
| `Module` | `SocketModule` | Декларация модуля |
| `IBootstrap` | `SocketBootstrap` | Интерфейс инициализации при старте |
| `logger` | `SocketBootstrap`, `SocketServerService` | Логирование |

### Внешние библиотеки

| Библиотека | Назначение |
|---|---|
| `socket.io` | WebSocket-сервер (Server, Socket) |
| `inversify` | DI-контейнер (inject, multiInject) |
| `@force-dev/utils` | `ForbiddenException` |

---

## Взаимодействие с другими модулями

Socket-модуль является центральным инфраструктурным модулем, который используется практически всеми доменными модулями для real-time коммуникации.

### Модули, использующие SocketEmitterService (отправка событий клиентам)

| Модуль | Listener / Handler | Назначение |
|---|---|---|
| **chat** | `ChatListener`, `ChatHandler` | Уведомления о новых чатах, обновлениях, typing; join/leave комнат |
| **chat-moderation** | `ChatModerationListener` | Уведомления о бане/разбане, slow mode |
| **message** | `MessageListener`, `MessageHandler` | Новые сообщения, редактирование, удаление, реакции, статусы доставки, read/delivered |
| **call** | `CallListener`, `CallHandler` | WebRTC signaling (offer/answer/ice-candidate), уведомления о звонках |
| **poll** | `PollListener` | Уведомления о голосовании и закрытии опросов |
| **profile** | `ProfileListener`, `ProfileHandler` | Обновления профиля, подписка на профиль |
| **contact** | `ContactListener` | Уведомления о запросах контактов и принятии |
| **sync** | `SyncListener` | Уведомления о доступности новых данных для синхронизации |
| **bot** | `BotListener` | Обработка доменных событий ботами |

### Модули, использующие SocketClientRegistry (проверка онлайн-статуса)

| Модуль | Listener | Назначение |
|---|---|---|
| **push** | `PushListener` | Отправляет push-уведомления только если пользователь офлайн (нет активных socket-соединений) |

### Паттерн взаимодействия

```
[Бизнес-сервис] --emit--> [EventBus] --subscribe--> [ISocketEventListener] --emit--> [SocketEmitterService] --> [Socket.IO клиент]
```

1. Бизнес-сервис (например, `MessageService`) выполняет операцию и публикует доменное событие через `EventBus`
2. Слушатель (например, `MessageListener`), реализующий `ISocketEventListener`, получает событие
3. Слушатель использует `SocketEmitterService` для отправки socket-события клиентам (в комнату чата, конкретному пользователю или широковещательно)

Бизнес-сервисы **никогда** не инжектят `SocketEmitterService` напрямую — связь всегда идёт через EventBus, что обеспечивает слабую связанность модулей.

### Регистрация в приложении

Socket-модуль импортируется в корневом `AppModule` (`src/app.module.ts`). Все доменные модули регистрируют свои хендлеры и слушатели через `asSocketHandler()` / `asSocketListener()` в собственных `@Module.providers`, а `SocketBootstrap` собирает их через `@multiInject`.
