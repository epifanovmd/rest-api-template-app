# Модуль Sync

Модуль инкрементальной синхронизации данных. Ведёт журнал изменений (sync log) ключевых сущностей и предоставляет клиентам API для получения дельты изменений с определённой версии.

## Структура файлов

```
src/modules/sync/
├── sync.module.ts             # Объявление модуля (@Module)
├── sync-log.entity.ts         # Entity журнала синхронизации (таблица sync_logs)
├── sync-log.repository.ts     # Репозиторий журнала
├── sync.service.ts            # Сервис синхронизации
├── sync.controller.ts         # REST-контроллер (tsoa)
├── sync.types.ts              # Перечисления (ESyncEntityType, ESyncAction)
├── sync.listener.ts           # Слушатель событий -> запись в sync log
├── dto/
│   └── sync.dto.ts            # SyncLogDto, ISyncResponseDto
└── sync.service.test.ts       # Тесты
```

## Entity

### SyncLog (таблица `sync_logs`)

| Поле | Тип | Описание |
|------|-----|----------|
| `version` | `bigint` (PK, auto-increment) | Монотонно возрастающая версия |
| `entityType` | `enum(ESyncEntityType)` | Тип сущности |
| `entityId` | `uuid` | ID сущности |
| `action` | `enum(ESyncAction)` | Действие (create/update/delete) |
| `userId` | `uuid`, nullable | ID пользователя (scope) |
| `chatId` | `uuid`, nullable | ID чата (scope) |
| `payload` | `jsonb`, nullable | Дополнительные данные |
| `createdAt` | `timestamp` | Время записи |

**Индексы:**
- `IDX_SYNC_LOGS_USER_VERSION` — составной (userId, version)
- `IDX_SYNC_LOGS_CHAT_VERSION` — составной (chatId, version)

## Endpoints

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/sync` | `@Security("jwt")` | Получить изменения с указанной версии. Query: `sinceVersion`, `limit` (default 100). |

## Сервисы

### SyncService

| Метод | Описание |
|-------|----------|
| `getChanges(userId, sinceVersion?, limit?)` | Возвращает изменения, доступные пользователю (по его userId и chatIds). Поддерживает пагинацию через `hasMore`. |
| `logChange(entityType, entityId, action, opts?)` | Записать изменение в журнал. |

## DTO

- **SyncLogDto** — version, entityType, entityId, action, chatId, payload, createdAt
- **ISyncResponseDto** — `{ changes: SyncLogDto[], currentVersion: string, hasMore: boolean }`

## Перечисления

```typescript
enum ESyncEntityType { MESSAGE = "message", CHAT = "chat", CHAT_MEMBER = "chat_member", CONTACT = "contact", PROFILE = "profile" }
enum ESyncAction { CREATE = "create", UPDATE = "update", DELETE = "delete" }
```

## Socket-интеграция

### SyncListener (ISocketEventListener)

Слушает доменные события и записывает изменения в sync log. После записи уведомляет пользователей через socket-событие `sync:available`.

| Событие EventBus | Тип сущности | Действие |
|------------------|--------------|----------|
| `MessageCreatedEvent` | MESSAGE | CREATE |
| `MessageUpdatedEvent` | MESSAGE | UPDATE |
| `MessageDeletedEvent` | MESSAGE | DELETE |
| `ChatCreatedEvent` | CHAT | CREATE |
| `ChatUpdatedEvent` | CHAT | UPDATE |
| `ChatMemberJoinedEvent` | CHAT_MEMBER | CREATE |
| `ChatMemberLeftEvent` | CHAT_MEMBER | DELETE |
| `ContactRequestEvent` | CONTACT | CREATE |
| `ContactAcceptedEvent` | CONTACT | UPDATE |
| `ProfileUpdatedEvent` | PROFILE | UPDATE |

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `ChatMemberRepository` | `modules/chat` | Определение chatIds пользователя |
| Доменные события | `modules/message`, `chat`, `contact`, `profile` | Триггеры для записи в sync log |
| `SocketEmitterService` | `modules/socket` | Уведомление `sync:available` |
| `EventBus` | `core` | Подписка на события |
