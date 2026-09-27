# Модуль Sync

Модуль инкрементальной синхронизации данных. Ведёт журнал изменений (sync log) ключевых сущностей и предоставляет клиентам API для получения дельты изменений с определённой версии.

## Структура файлов

```
src/modules/sync/
├── sync.module.ts             # Объявление модуля (@Module)
├── sync-log.entity.ts         # Entity журнала синхронизации (таблица sync_logs)
├── sync-state.entity.ts       # Служебное состояние (таблица sync_state, watermark retention)
├── sync-log.repository.ts     # Репозиторий журнала
├── sync.service.ts            # Сервис синхронизации
├── sync.controller.ts         # REST-контроллер (tsoa)
├── sync-cleanup.job.ts        # SyncCleanupJob — retention по cron
├── sync-compaction.job.ts     # SyncCompactionJob — компактификация по cron
├── sync.errors.ts             # SyncError (SYNC_*)
├── sync.types.ts              # Перечисления (ESyncEntityType, ESyncAction), имена очередей
├── sync.listener.ts           # Слушатель событий -> запись в sync log
├── dto/
│   └── sync.dto.ts            # SyncLogDto, ISyncResponseDto
└── *.test.ts                  # Тесты сервиса, listener, задач
```

## Entities

### SyncLog (таблица `sync_logs`)

| Поле         | Тип                           | Описание                                                                      |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------- |
| `version`    | `bigint` (PK, auto-increment) | Монотонно возрастающая версия                                                 |
| `entityType` | `enum(ESyncEntityType)`       | Тип сущности                                                                  |
| `entityId`   | `varchar(255)`                | ID сущности; для составных — `chatId:userId`                                  |
| `entityKey`  | `varchar(255)`                | Ключ компактификации: `{type}:{id}`, для user-scoped — `{type}:{id}@{userId}` |
| `action`     | `enum(ESyncAction)`           | Действие (create/update/delete)                                               |
| `userId`     | `uuid`, nullable              | User-scoped: запись видит только этот пользователь                            |
| `scopeId`    | `uuid`, nullable              | Scope-scoped: запись видят все с доступом к scope (сейчас — участники чата)   |
| `payload`    | `jsonb`, nullable             | Данные изменения                                                              |
| `createdAt`  | `timestamptz`                 | Время записи                                                                  |

Ровно одно из `userId`/`scopeId` задано. Индексы: `(entityKey, version)`, `(version)`,
`(scopeId, version)`, `(userId, version)`, `(createdAt)`.

### SyncState (таблица `sync_state`)

`key varchar(50)` (PK) → `value bigint`. Ключ `retention_watermark` — максимальная
версия, удалённая retention-очисткой; поднимается в той же транзакции, что и удаление.

## Endpoints

| Метод | Путь                   | Security           | Описание                                                                                                                  |
| ----- | ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GET` | `/api/v1/sync`         | `@Security("jwt")` | Изменения с версии. Query: `sinceVersion` (только цифры, иначе 400 `SYNC_INVALID_VERSION`), `limit` (1…500, default 100). |
| `GET` | `/api/v1/sync/version` | `@Security("jwt")` | Текущая версия журнала.                                                                                                   |

## Правила

- **requiresSnapshot** — `sinceVersion` ниже watermark retention (часть изменений
  клиента удалена) или выше последней версии. Компактификация на это не влияет: она
  удаляет только устаревшие версии ключа, последняя версия остаётся.
- **Потеря доступа к чату** (выход, исключение, бан, удаление чата) — user-scoped
  `CHAT delete` бывшему участнику: scope-записи чата ему больше не видны.
- **Write-time compaction** — после записи удаляются старые версии того же `entityKey`;
  у user-scoped ключ включает пользователя, чтобы запись одного не вытесняла записи
  другого или scope-записи той же сущности.

## Сервисы

### SyncService

| Метод                                            | Описание                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `getChanges(userId, sinceVersion?, limit?)`      | Изменения, доступные пользователю (его user-scoped + scope его чатов), компактифицированные. |
| `getCurrentVersion()`                            | Текущая версия (не ниже watermark).                                                          |
| `logChange(entityType, entityId, action, opts?)` | Записать изменение и отправить `sync:available` из `notifyUserIds`.                          |
| `cleanup(retentionDays)`                         | Retention: удалить старые записи, поднять watermark.                                         |
| `compact()`                                      | Фоновая компактификация дубликатов; ошибка пробрасывается в очередь.                         |

## Очереди (периодические задачи)

| Очередь           | Обработчик          | Cron           | Что делает                                        |
| ----------------- | ------------------- | -------------- | ------------------------------------------------- |
| `sync.cleanup`    | `SyncCleanupJob`    | `30 3 * * *`   | Retention: удалить записи старше 90 дней          |
| `sync.compaction` | `SyncCompactionJob` | `15 */6 * * *` | Удалить устаревшие версии `entityKey` (страховка) |

Cron-задачу выполняет ровно один процесс кластера (`APP_ROLE=worker|all`), поэтому
advisory-lock и таймеры не нужны. Обе — 2 повтора, срок 30 мин.

## Ошибки

| Код                    | Статус | Когда                                   |
| ---------------------- | ------ | --------------------------------------- |
| `SYNC_INVALID_VERSION` | 400    | `sinceVersion` не неотрицательное целое |

## DTO

- **SyncLogDto** — version, entityType, entityId, entityKey, action, scopeId, payload, createdAt
- **ISyncResponseDto** — `{ changes, currentVersion, hasMore, requiresSnapshot }`

## Перечисления

```typescript
enum ESyncEntityType {
  MESSAGE,
  CHAT,
  CHAT_MEMBER,
  CONTACT,
  PROFILE,
  MESSAGE_PIN, // закреплённое сообщение
  POLL,
  CHAT_PIN, // личное закрепление чата в списке
  CHAT_FOLDER, // папка чатов пользователя
  CHAT_FOLDER_ITEM, // в какой папке чат у пользователя
  CHAT_MUTE, // личный мут чата
}
enum ESyncAction {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}
```

## SyncListener

| Событие EventBus                                                               | Сущность                                                        | Действие                 | Scope                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------ | ---------------------- |
| `MessageCreatedEvent` / `MessageUpdatedEvent` / `MessageDeletedEvent` (forAll) | MESSAGE                                                         | CREATE / UPDATE / DELETE | чат                    |
| `ChatCreatedEvent` / `ChatUpdatedEvent`                                        | CHAT                                                            | CREATE / UPDATE          | чат                    |
| `ChatMemberJoinedEvent`                                                        | CHAT_MEMBER (`chatId:userId`, payload с ролью)                  | CREATE                   | чат                    |
| `ChatMemberRoleChangedEvent`                                                   | CHAT_MEMBER                                                     | UPDATE                   | чат                    |
| `ChatMemberLeftEvent`                                                          | CHAT_MEMBER DELETE (чат) + CHAT DELETE (ушедшему)               |                          | чат / user             |
| `ChatMemberBannedEvent`                                                        | CHAT                                                            | DELETE                   | забаненный             |
| `ChatDeletedEvent`                                                             | CHAT                                                            | DELETE                   | каждый бывший участник |
| `ChatPinnedEvent`                                                              | CHAT_PIN (`{ chatId, isPinned }`)                               | UPDATE                   | user                   |
| `MessagePinnedEvent` / `MessageUnpinnedEvent`                                  | MESSAGE_PIN                                                     | CREATE / DELETE          | чат                    |
| `PollCreatedEvent` / `PollVotedEvent` / `PollClosedEvent`                      | POLL (`pollId, chatId, messageId, isClosed`)                    | CREATE / UPDATE          | чат                    |
| `ContactRequestEvent` / `ContactAcceptedEvent`                                 | CONTACT                                                         | CREATE / UPDATE          | user                   |
| `ChatMutedEvent`                                                               | CHAT_MUTE (id = chatId, `{ chatId, mutedUntil }`)               | UPDATE                   | user                   |
| `ChatMovedToFolderEvent`                                                       | CHAT_FOLDER_ITEM (id = chatId, `{ chatId, folderId }`)          | UPDATE                   | user                   |
| `ChatFolderChangedEvent` (created / updated / deleted)                         | CHAT_FOLDER (id = folderId, `ChatFolderDto` или `{ folderId }`) | CREATE / UPDATE / DELETE | user                   |

Payload MESSAGE и CHAT — `MessageDto` / `ChatDto` со ссылками на файлы, подписанными
`FileUrlService` (для s3 — presigned URL хранилища). Ссылки живут
`STORAGE_SIGNED_URL_TTL_SECONDS`: при догоняющей синхронизации старше срока клиент
перечитывает сущность по API.

`mutedUntil` — ISO-строка или `null` (мут снят); `folderId: null` — чат убран из папки.
Удаление папки переносит её чаты в «без папки» без отдельных событий: клиент по
`CHAT_FOLDER delete` сам сбрасывает `folderId` у чатов этой папки.

## Зависимости

| Зависимость            | Откуда                                       | Использование                            |
| ---------------------- | -------------------------------------------- | ---------------------------------------- |
| `ChatMemberRepository` | `modules/chat`                               | chatIds пользователя, участники для push |
| Доменные события       | `modules/message`, `chat`, `contact`, `poll` | Триггеры записи в sync log               |
| `SocketEmitterService` | `modules/socket`                             | `sync:available`                         |
| `asJobHandler`         | `core`                                       | Периодические задачи                     |
| `EventBus`             | `core`                                       | Подписка на события                      |
