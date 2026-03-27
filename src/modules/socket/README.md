# Модуль Socket

Инфраструктурный модуль реального времени на базе Socket.IO. Предоставляет WebSocket-сервер с JWT-аутентификацией, реестр подключённых клиентов, типизированный эмиттер событий и точки расширения для других модулей.

## Структура файлов

```
src/modules/socket/
├── socket.module.ts                  # Объявление модуля (@Module) + bootstrapper
├── socket-server.service.ts          # Обёртка над Socket.IO Server
├── socket-auth.middleware.ts         # JWT-аутентификация при подключении
├── socket-client-registry.ts        # Реестр подключённых клиентов (isOnline)
├── socket-emitter.service.ts        # Типизированный эмиттер событий
├── socket.bootstrap.ts              # Bootstrap: запуск сервера, регистрация handlers/listeners
├── socket-handler.interface.ts      # ISocketHandler + SOCKET_HANDLER токен
├── socket-event-listener.interface.ts # ISocketEventListener + SOCKET_EVENT_LISTENER токен
├── socket.helpers.ts                # Хелперы asSocketHandler(), asSocketListener()
├── socket.types.ts                  # Типы TSocket, TServer, ISocketEvents, ISocketEmitEvents
└── index.ts                         # Публичный API модуля
```

## Компоненты

### SocketServerService

Обёртка над `Socket.IO Server`. Создаётся с CORS-настройками из конфига, транспорт только WebSocket.

| Метод | Описание |
|-------|----------|
| `io` (getter) | Экземпляр Socket.IO Server |
| `close()` | Остановить сервер |

### SocketAuthMiddleware

JWT-аутентификация при каждом подключении. Извлекает токен из `socket.handshake.auth.token`, верифицирует через `TokenService` и записывает `AuthContext` в `socket.data`.

### SocketClientRegistry

Реестр активных соединений. Поддерживает несколько соединений на пользователя (Map<userId, Set<TSocket>>).

| Метод | Описание |
|-------|----------|
| `register(userId, socket)` | Зарегистрировать соединение |
| `unregister(userId, socket)` | Удалить соединение |
| `isOnline(userId)` | Проверить, есть ли активные соединения |

### SocketEmitterService

Типизированный сервис отправки событий.

| Метод | Описание |
|-------|----------|
| `toUser(userId, event, ...args)` | Отправить событие пользователю (room `user_${userId}`) |
| `toRoom(room, event, ...args)` | Отправить в комнату |
| `broadcast(event, ...args)` | Широковещательная рассылка |

### SocketBootstrap (IBootstrap)

Инициализация при старте приложения:

1. Регистрация JWT middleware
2. При подключении: регистрация в `SocketClientRegistry`, join в room `user_${userId}`, вызов всех `ISocketHandler.onConnection()`
3. При отключении: unregister из реестра
4. Вызов `register()` на всех `ISocketEventListener`

### Интерфейсы расширения

- **ISocketHandler** — обрабатывает входящие socket-события. Регистрация через `asSocketHandler()`.
- **ISocketEventListener** — слушает EventBus и транслирует в socket/push. Регистрация через `asSocketListener()`.

## Типы событий

### Клиент -> Сервер (ISocketEvents)

- `profile:subscribe` — подписка на обновления профилей
- `chat:join`, `chat:leave`, `chat:typing` — управление комнатами чата
- `message:read`, `message:delivered` — статусы сообщений
- `e2e:key-exchange`, `e2e:ratchet` — E2E шифрование
- `call:offer`, `call:answer`, `call:ice-candidate`, `call:hangup` — WebRTC signaling

### Сервер -> Клиент (ISocketEmitEvents)

Более 40 событий, включая: `authenticated`, `message:new`, `message:updated`, `message:deleted`, `chat:created`, `chat:typing`, `chat:unread`, `call:incoming`, `call:ended`, `poll:voted`, `contact:request`, `sync:available`, `e2e:prekeys-low`, `push:settings-changed`, `user:privileges-changed` и др.

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `socket.io` | npm | WebSocket-сервер |
| `HttpServer` | `core` | HTTP-сервер для Socket.IO |
| `TokenService` | `core` | JWT-верификация |
| `EventBus` | `core` | Очистка подписок при shutdown |
| `config.cors` | `config` | CORS-настройки |

## Взаимодействие

Все доменные модули (profile, chat, message, call, poll, encryption, sync, push, bot, contact) регистрируют свои handlers и listeners через `SOCKET_HANDLER` и `SOCKET_EVENT_LISTENER` токены. SocketBootstrap собирает их через `@multiInject` и активирует при старте.
