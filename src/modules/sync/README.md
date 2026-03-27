# Модуль Sync

## Краткое описание

Модуль инкрементальной синхронизации данных. Ведет журнал изменений (sync log) всех ключевых сущностей системы (сообщения, чаты, участники чатов, контакты, профили) и предоставляет клиентам API для получения дельты изменений начиная с определенной версии. Это позволяет клиентским приложениям запрашивать только новые изменения вместо полной перезагрузки данных.

---

## Структура файлов модуля

```
src/modules/sync/
├── dto/
│   └── sync.dto.ts            # DTO для ответа синхронизации
├── sync-log.entity.ts         # TypeORM entity — запись журнала изменений
├── sync-log.repository.ts     # Репозиторий с методами выборки изменений
├── sync.controller.ts         # REST-контроллер (tsoa)
├── sync.listener.ts           # Слушатель доменных событий (EventBus + Socket)
├── sync.module.ts             # Определение модуля (@Module)
├── sync.service.ts            # Бизнес-логика синхронизации
├── sync.service.test.ts       # Unit-тесты сервиса
└── sync.types.ts              # Перечисления (enums) типов сущностей и действий
```

---

## Entity

### SyncLog

Таблица: `sync_logs`

Журнал изменений. Каждая запись фиксирует одно изменение (создание, обновление или удаление) конкретной сущности.

| Поле         | Тип                          | Описание                                           |
|--------------|------------------------------|----------------------------------------------------|
| `version`    | `bigint` (PK, auto-increment)| Глобальная монотонно растущая версия изменения      |
| `entityType` | `enum ESyncEntityType`       | Тип сущности (message, chat, chat_member, contact, profile) |
| `entityId`   | `uuid`                       | ID измененной сущности                              |
| `action`     | `enum ESyncAction`           | Тип действия (create, update, delete)               |
| `userId`     | `uuid` (nullable)            | ID пользователя, к которому относится изменение     |
| `chatId`     | `uuid` (nullable)            | ID чата, к которому относится изменение             |
| `payload`    | `jsonb` (nullable)           | Произвольные дополнительные данные изменения        |
| `createdAt`  | `timestamp`                  | Дата и время создания записи (auto)                 |

**Индексы:**
- `IDX_SYNC_LOGS_USER_VERSION` — составной индекс по `(userId, version)` для быстрой выборки изменений пользователя
- `IDX_SYNC_LOGS_CHAT_VERSION` — составной индекс по `(chatId, version)` для быстрой выборки изменений чата

**Связи с другими entity:**
Прямых связей (foreign keys) нет. Поля `entityId`, `userId`, `chatId` содержат UUID-ссылки на соответствующие сущности, но без TypeORM-relations. Это сделано намеренно — sync log является append-only журналом и не должен зависеть от существования целевых записей (например, удаленная сущность все равно должна быть зафиксирована в логе).

---

## Типы (Enums)

### ESyncEntityType

Типы сущностей, изменения которых отслеживаются:

| Значение       | Описание               |
|----------------|------------------------|
| `message`      | Сообщение              |
| `chat`         | Чат                    |
| `chat_member`  | Участник чата          |
| `contact`      | Контакт                |
| `profile`      | Профиль пользователя   |

### ESyncAction

Типы действий над сущностями:

| Значение  | Описание   |
|-----------|------------|
| `create`  | Создание   |
| `update`  | Обновление |
| `delete`  | Удаление   |

---

## Endpoints

### `GET /api/sync`

Получить изменения начиная с указанной версии (инкрементальная синхронизация).

| Параметр       | Тип      | Обязательный | Описание                                             |
|----------------|----------|--------------|------------------------------------------------------|
| `sinceVersion` | `string` | Нет          | Версия, начиная с которой запрашивать изменения. Если не указана — возвращаются все доступные изменения |
| `limit`        | `number` | Нет          | Максимальное количество записей (по умолчанию 100)   |

**Security:** `@Security("jwt")` — требуется авторизация через JWT-токен. Дополнительных permission не требуется — любой аутентифицированный пользователь может получить свои изменения.

**Ответ:** `ISyncResponseDto`

```typescript
{
  changes: SyncLogDto[];    // Массив изменений
  currentVersion: string;   // Версия последнего изменения в ответе
  hasMore: boolean;         // Есть ли ещё неполученные изменения
}
```

**Логика фильтрации:** Пользователь получает только те изменения, которые относятся к нему лично (`userId`) или к чатам, участником которых он является. Изменения с `userId = NULL` и `chatId = NULL` считаются глобальными и возвращаются всем.

---

## Сервисы

### SyncService

Основной сервис модуля. Внедряет `SyncLogRepository` и `ChatMemberRepository`.

#### `getChanges(userId, sinceVersion?, limit?): Promise<ISyncResponseDto>`

Получение дельты изменений для пользователя:
1. Запрашивает список чатов пользователя через `ChatMemberRepository.find()`
2. Извлекает chatIds из memberships
3. Вызывает `SyncLogRepository.getChangesSince()` с фильтрацией по userId и chatIds
4. Маппит результат в `SyncLogDto`
5. Определяет `currentVersion` — версия последнего изменения в выборке, либо `sinceVersion`, либо `"0"`
6. Возвращает `{ changes, currentVersion, hasMore }`

#### `logChange(entityType, entityId, action, opts?): Promise<void>`

Запись нового изменения в журнал:
- `entityType` — тип сущности (`ESyncEntityType`)
- `entityId` — ID сущности
- `action` — действие (`ESyncAction`)
- `opts.userId` — ID пользователя (опционально)
- `opts.chatId` — ID чата (опционально)
- `opts.payload` — дополнительные данные (опционально)

Все необязательные поля по умолчанию `null`.

---

## DTO

### SyncLogDto

Наследуется от `BaseDto`. Представление одной записи журнала изменений для API-ответа.

| Поле         | Тип                            | Описание                       |
|--------------|--------------------------------|--------------------------------|
| `version`    | `string`                       | Глобальная версия изменения    |
| `entityType` | `ESyncEntityType`              | Тип сущности                   |
| `entityId`   | `string`                       | ID сущности                    |
| `action`     | `ESyncAction`                  | Тип действия                   |
| `chatId`     | `string \| null`               | ID чата (если применимо)       |
| `payload`    | `Record<string, unknown> \| null` | Дополнительные данные       |
| `createdAt`  | `Date`                         | Время создания записи          |

Статический метод `fromEntity(entity: SyncLog)` для создания DTO из entity.

### ISyncResponseDto

Интерфейс ответа endpoint синхронизации:

| Поле             | Тип             | Описание                              |
|------------------|-----------------|---------------------------------------|
| `changes`        | `SyncLogDto[]`  | Список изменений                      |
| `currentVersion` | `string`        | Текущая версия (для следующего запроса)|
| `hasMore`        | `boolean`       | Есть ли ещё данные для получения       |

---

## События (Events)

Модуль **не определяет** собственных доменных событий, но **слушает** события из других модулей через `SyncListener`.

### Прослушиваемые события

| Событие                 | Модуль-источник | Действие в sync log                              | Socket-уведомление |
|-------------------------|-----------------|--------------------------------------------------|--------------------|
| `MessageCreatedEvent`   | message         | `logChange(MESSAGE, id, CREATE, {chatId})`       | Да — участникам чата |
| `MessageUpdatedEvent`   | message         | `logChange(MESSAGE, id, UPDATE, {chatId})`       | Нет                |
| `MessageDeletedEvent`   | message         | `logChange(MESSAGE, messageId, DELETE, {chatId})` | Нет                |
| `ChatCreatedEvent`      | chat            | `logChange(CHAT, id, CREATE, {chatId})`          | Да — участникам чата |
| `ChatUpdatedEvent`      | chat            | `logChange(CHAT, id, UPDATE, {chatId})`          | Нет                |
| `ChatMemberJoinedEvent` | chat            | `logChange(CHAT_MEMBER, userId, CREATE, {chatId, userId})` | Нет       |
| `ChatMemberLeftEvent`   | chat            | `logChange(CHAT_MEMBER, userId, DELETE, {chatId, userId})` | Нет        |
| `ContactRequestEvent`   | contact         | `logChange(CONTACT, id, CREATE, {userId})`       | Да — целевому пользователю |
| `ContactAcceptedEvent`  | contact         | `logChange(CONTACT, id, UPDATE, {userId})`       | Да — инициатору запроса |
| `ProfileUpdatedEvent`   | profile         | `logChange(PROFILE, id, UPDATE)`                 | Нет                |

---

## Socket-интеграция

### SyncListener

Реализует интерфейс `ISocketEventListener`. Регистрируется через `asSocketListener(SyncListener)` в модуле.

**Исходящее событие:**

| Событие           | Получатели           | Данные             | Описание                              |
|-------------------|----------------------|--------------------|---------------------------------------|
| `sync:available`  | Конкретные пользователи | `{ version: "0" }` | Уведомление о наличии новых изменений |

Событие `sync:available` отправляется через `SocketEmitterService.toUser()` при:
- Создании нового сообщения — всем участникам чата (`event.memberUserIds`)
- Создании нового чата — всем участникам чата (`event.memberUserIds`)
- Получении запроса контакта — целевому пользователю (`event.targetUserId`)
- Принятии контакта — инициатору запроса (`event.requesterId`)

Клиент, получив `sync:available`, должен вызвать `GET /api/sync?sinceVersion=...` для получения актуальных изменений.

---

## Зависимости

### Импортируемые модули и зависимости

| Зависимость              | Модуль   | Использование                                      |
|--------------------------|----------|-----------------------------------------------------|
| `ChatMemberRepository`   | chat     | Получение списка чатов пользователя для фильтрации  |
| `SocketEmitterService`   | socket   | Отправка socket-уведомлений `sync:available`         |
| `EventBus`               | core     | Подписка на доменные события из других модулей       |

### Используемые события из других модулей

- **chat**: `ChatCreatedEvent`, `ChatUpdatedEvent`, `ChatMemberJoinedEvent`, `ChatMemberLeftEvent`
- **message**: `MessageCreatedEvent`, `MessageUpdatedEvent`, `MessageDeletedEvent`
- **contact**: `ContactRequestEvent`, `ContactAcceptedEvent`
- **profile**: `ProfileUpdatedEvent`

---

## Взаимодействие с другими модулями

```
┌──────────┐  events   ┌──────────┐  events   ┌───────────┐
│ message  │──────────>│          │<──────────│  contact   │
└──────────┘           │          │           └───────────┘
                       │   Sync   │
┌──────────┐  events   │  Module  │  events   ┌───────────┐
│   chat   │──────────>│          │<──────────│  profile   │
└──────────┘           │          │           └───────────┘
                       └────┬─────┘
                            │
              ┌─────────────┼─────────────┐
              v             v             v
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ chat     │  │ socket   │  │ REST API │
        │ (member  │  │ (emit    │  │ (GET     │
        │  repo)   │  │  events) │  │  /sync)  │
        └──────────┘  └──────────┘  └──────────┘
```

- **Входящий поток:** Модуль подписывается на доменные события из модулей `message`, `chat`, `contact` и `profile` через `EventBus`. При получении события записывает изменение в `sync_logs` и при необходимости отправляет socket-уведомление.
- **Исходящий поток:** Клиенты получают socket-событие `sync:available`, после чего запрашивают `GET /api/sync?sinceVersion=X` для получения конкретных изменений.
- **Чтение данных:** Для фильтрации изменений по чатам пользователя модуль обращается к `ChatMemberRepository` из модуля `chat`.

Модуль Sync является **потребителем** событий и **не генерирует** собственных доменных событий. Другие модули не зависят от Sync — связь однонаправленная.

---

## Тесты

Файл `sync.service.test.ts` содержит unit-тесты для `SyncService`:

- **getChanges:** проверяет получение изменений с указанной версии, пустой результат при отсутствии memberships, значение лимита по умолчанию (100)
- **logChange:** проверяет создание записи в журнале с полным набором параметров и значения по умолчанию (null) для опциональных полей
