# Модуль Message

Модуль сообщений мессенджера. Реализует полный цикл работы с сообщениями в чатах: отправка, редактирование, удаление, поиск, реакции, закрепление, упоминания, вложения, запланированные и самоуничтожающиеся сообщения, медиа-галерея, статусы доставки/прочтения.

---

## Структура файлов

```
src/modules/message/
├── message.module.ts                  # Объявление модуля (@Module)
├── message.entity.ts                  # Entity: Message
├── message.repository.ts             # Репозиторий сообщений (cursor-пагинация, поиск, медиа)
├── message.service.ts                # Бизнес-логика сообщений
├── message.controller.ts             # REST-контроллер (Route: api/message)
├── chat-message.controller.ts        # REST-контроллер (Route: api/chat/{chatId}/message)
├── message.types.ts                  # Перечисления EMessageType, EMessageStatus
├── message.handler.ts                # Socket-обработчик входящих событий
├── message.listener.ts               # Socket-слушатель доменных событий (EventBus -> Socket)
├── message-scheduler.bootstrap.ts    # Bootstrap: планировщик отложенных и самоуничтожающихся сообщений
├── message-attachment.entity.ts      # Entity: MessageAttachment
├── message-attachment.repository.ts  # Репозиторий вложений
├── message-reaction.entity.ts        # Entity: MessageReaction
├── message-reaction.repository.ts    # Репозиторий реакций
├── message-mention.entity.ts         # Entity: MessageMention
├── message-mention.repository.ts     # Репозиторий упоминаний
├── dto/
│   ├── message.dto.ts                # MessageDto, MessageAttachmentDto, интерфейсы списков
│   ├── media-gallery.dto.ts          # MediaItemDto, IMediaGalleryDto, IMediaStatsDto
│   └── index.ts
├── events/
│   ├── message-created.event.ts      # MessageCreatedEvent
│   ├── message-updated.event.ts      # MessageUpdatedEvent
│   ├── message-deleted.event.ts      # MessageDeletedEvent
│   ├── message-read.event.ts         # MessageReadEvent
│   ├── message-delivered.event.ts    # MessageDeliveredEvent
│   ├── message-pinned.event.ts       # MessagePinnedEvent, MessageUnpinnedEvent
│   ├── message-reaction.event.ts     # MessageReactionEvent
│   └── index.ts
├── validation/
│   ├── send-message.validate.ts      # Zod-схема отправки сообщения
│   ├── edit-message.validate.ts      # Zod-схема редактирования
│   ├── mark-read.validate.ts         # Zod-схема отметки о прочтении
│   ├── reaction.validate.ts          # Zod-схема реакции
│   └── index.ts
├── index.ts                          # Реэкспорт публичного API модуля
├── message.service.test.ts           # Тесты сервиса
├── message.handler.test.ts           # Тесты socket-обработчика
├── message-scheduler.bootstrap.test.ts # Тесты планировщика
├── message.listener.test.ts          # Тесты слушателя событий
└── dto/message.dto.test.ts           # Тесты DTO
```

---

## Entities

### Message

Таблица: `messages`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `chatId` | `uuid` (FK -> chats) | ID чата |
| `senderId` | `uuid` (FK -> users) | ID отправителя |
| `type` | `enum EMessageType` | Тип сообщения (text, image, file, voice, system, poll, sticker) |
| `content` | `text`, nullable | Текстовое содержимое |
| `replyToId` | `uuid`, nullable (FK -> messages) | ID сообщения, на которое отвечают |
| `forwardedFromId` | `uuid`, nullable (FK -> messages) | ID пересланного сообщения |
| `status` | `enum EMessageStatus` | Статус (sent, delivered, read) |
| `isEdited` | `boolean` | Было ли отредактировано |
| `isDeleted` | `boolean` | Soft-delete флаг |
| `isPinned` | `boolean` | Закреплено ли |
| `pinnedAt` | `timestamp`, nullable | Время закрепления |
| `pinnedById` | `uuid`, nullable | Кто закрепил |
| `encryptedContent` | `text`, nullable | Зашифрованное содержимое (E2E) |
| `encryptionMetadata` | `jsonb`, nullable | Метаданные шифрования |
| `stickerId` | `uuid`, nullable | ID стикера |
| `keyboard` | `jsonb`, nullable | Inline-клавиатура (бот) |
| `linkPreviews` | `jsonb`, nullable | Массив превью ссылок (url, title, description, imageUrl, siteName) |
| `scheduledAt` | `timestamp`, nullable | Время запланированной отправки |
| `isScheduled` | `boolean` | Является ли запланированным |
| `selfDestructSeconds` | `integer`, nullable | Таймер самоуничтожения в секундах |
| `selfDestructAt` | `timestamp`, nullable | Время уничтожения (устанавливается при открытии получателем) |
| `createdAt` | `timestamp` | Дата создания |
| `updatedAt` | `timestamp` | Дата обновления |

**Связи:**
- `ManyToOne` -> `Chat` (onDelete: CASCADE)
- `ManyToOne` -> `User` (sender, onDelete: SET NULL)
- `ManyToOne` -> `Message` (replyTo, self-reference, onDelete: SET NULL)
- `ManyToOne` -> `Message` (forwardedFrom, self-reference, onDelete: SET NULL)
- `OneToMany` -> `MessageAttachment[]` (cascade, eager)
- `OneToMany` -> `MessageReaction[]` (cascade)
- `OneToMany` -> `MessageMention[]` (cascade, eager)

**Индексы:**
- `IDX_MESSAGES_CHAT_CREATED` — `(chatId, createdAt)` — быстрая загрузка сообщений чата
- `IDX_MESSAGES_SENDER` — `(senderId)`

---

### MessageAttachment

Таблица: `message_attachments`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `messageId` | `uuid` (FK -> messages) | ID сообщения |
| `fileId` | `uuid` (FK -> files) | ID файла |
| `createdAt` | `timestamp` | Дата создания |

**Связи:**
- `ManyToOne` -> `Message` (onDelete: CASCADE)
- `ManyToOne` -> `File` (onDelete: CASCADE, eager)

**Индексы:**
- `IDX_MSG_ATTACHMENTS_MESSAGE` — `(messageId)`

---

### MessageReaction

Таблица: `message_reactions`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `messageId` | `uuid` (FK -> messages) | ID сообщения |
| `userId` | `uuid` (FK -> users) | ID пользователя |
| `emoji` | `varchar(20)` | Эмодзи реакции |
| `createdAt` | `timestamp` | Дата создания |

**Связи:**
- `ManyToOne` -> `Message` (onDelete: CASCADE)
- `ManyToOne` -> `User` (onDelete: CASCADE)

**Индексы:**
- `IDX_REACTIONS_MESSAGE` — `(messageId)`
- `IDX_REACTIONS_MESSAGE_USER` — `(messageId, userId)` UNIQUE — один пользователь = одна реакция на сообщение

---

### MessageMention

Таблица: `message_mentions`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `messageId` | `uuid` (FK -> messages) | ID сообщения |
| `userId` | `uuid`, nullable | ID упомянутого пользователя (null если `isAll`) |
| `isAll` | `boolean` | Упоминание всех участников (@all) |

**Связи:**
- `ManyToOne` -> `Message` (onDelete: CASCADE)

**Индексы:**
- `IDX_MENTIONS_MESSAGE` — `(messageId)`
- `IDX_MENTIONS_USER` — `(userId)`

---

## Перечисления (Enums)

### EMessageType
| Значение | Описание |
|----------|----------|
| `text` | Текстовое сообщение |
| `image` | Изображение |
| `file` | Файл |
| `voice` | Голосовое сообщение |
| `system` | Системное сообщение |
| `poll` | Опрос |
| `sticker` | Стикер |

### EMessageStatus
| Значение | Описание |
|----------|----------|
| `sent` | Отправлено |
| `delivered` | Доставлено |
| `read` | Прочитано |

---

## Endpoints

### MessageController (`api/message`)

| Метод | Путь | Описание | Security | Валидация |
|-------|------|----------|----------|-----------|
| `GET` | `api/message/search?q=&limit=&offset=` | Глобальный поиск сообщений во всех чатах пользователя | `@Security("jwt")` | -- |
| `PATCH` | `api/message/{id}` | Редактирование сообщения (только автор) | `@Security("jwt")` | `EditMessageSchema` |
| `POST` | `api/message/{id}/reaction` | Добавление реакции на сообщение | `@Security("jwt")` | `AddReactionSchema` |
| `DELETE` | `api/message/{id}/reaction` | Удаление своей реакции с сообщения | `@Security("jwt")` | -- |
| `POST` | `api/message/{id}/pin` | Закрепление сообщения (admin/owner чата) | `@Security("jwt")` | -- |
| `DELETE` | `api/message/{id}/pin` | Открепление сообщения (admin/owner чата) | `@Security("jwt")` | -- |
| `DELETE` | `api/message/{id}` | Soft-delete сообщения (автор или admin/owner чата) | `@Security("jwt")` | -- |
| `POST` | `api/message/{id}/open` | Отметка сообщения как открытого (запуск таймера самоуничтожения) | `@Security("jwt")` | -- |

### ChatMessageController (`api/chat`)

| Метод | Путь | Описание | Security | Валидация |
|-------|------|----------|----------|-----------|
| `POST` | `api/chat/{chatId}/message` | Отправка сообщения в чат | `@Security("jwt")` | `SendMessageSchema` |
| `GET` | `api/chat/{chatId}/message?before=&limit=` | Список сообщений чата (cursor-пагинация) | `@Security("jwt")` | -- |
| `GET` | `api/chat/{chatId}/message/search?q=&limit=&offset=` | Поиск сообщений в конкретном чате | `@Security("jwt")` | -- |
| `GET` | `api/chat/{chatId}/message/pinned` | Получение закрепленных сообщений чата | `@Security("jwt")` | -- |
| `GET` | `api/chat/{chatId}/media?type=&limit=&offset=` | Медиа-галерея чата (фильтр по MIME: image, video, audio) | `@Security("jwt")` | -- |
| `GET` | `api/chat/{chatId}/media/stats` | Статистика медиафайлов чата (количество по типам) | `@Security("jwt")` | -- |
| `POST` | `api/chat/{chatId}/message/read` | Отметить сообщения как прочитанные до указанного messageId | `@Security("jwt")` | `MarkReadSchema` |
| `GET` | `api/chat/{chatId}/message/scheduled` | Получение запланированных сообщений пользователя в чате | `@Security("jwt")` | -- |
| `DELETE` | `api/chat/{chatId}/message/scheduled/{messageId}` | Отмена запланированного сообщения (только автор) | `@Security("jwt")` | -- |

---

## Сервис (MessageService)

Основной бизнес-сервис модуля. Внедряет зависимости через inversify.

### Основные методы

| Метод | Описание |
|-------|----------|
| `sendMessage(chatId, senderId, data)` | Отправка сообщения. Проверяет право на отправку через `ChatService.canSendMessage()`. Создает сообщение, вложения и упоминания в транзакции. Обновляет `lastMessageAt` чата. Для незапланированных сообщений эмитит `MessageCreatedEvent` и асинхронно запрашивает link previews. |
| `getMessages(chatId, userId, before?, limit?)` | Получение сообщений с cursor-based пагинацией. Проверяет членство в чате. По умолчанию limit=50. |
| `editMessage(messageId, userId, content)` | Редактирование. Только автор может редактировать. Нельзя редактировать удаленные. Устанавливает `isEdited=true`. Эмитит `MessageUpdatedEvent`. |
| `deleteMessage(messageId, userId)` | Soft-delete. Автор может удалить свое, admin/owner чата — любое. Обнуляет content. Эмитит `MessageDeletedEvent`. |
| `pinMessage(messageId, userId)` | Закрепление. Только admin/owner чата. Эмитит `MessagePinnedEvent`. |
| `unpinMessage(messageId, userId)` | Открепление. Только admin/owner чата. Эмитит `MessageUnpinnedEvent`. |
| `getPinnedMessages(chatId, userId)` | Получение закрепленных сообщений. Проверяет членство. |
| `markAsDelivered(chatId, userId, messageIds)` | Массовая отметка доставки (статус DELIVERED). Только для чужих сообщений со статусом SENT. Эмитит `MessageDeliveredEvent`. |
| `markAsRead(chatId, userId, messageId)` | Отметка прочтения. Обновляет `lastReadMessageId` в membership и статус всех предшествующих сообщений на READ. Эмитит `MessageReadEvent`. |
| `addReaction(messageId, userId, emoji)` | Добавление/обновление реакции. Один пользователь — одна реакция на сообщение (обновляется emoji). Эмитит `MessageReactionEvent`. |
| `removeReaction(messageId, userId)` | Удаление реакции. Эмитит `MessageReactionEvent` с `emoji=null`. |
| `searchMessages(chatId, userId, query, limit?, offset?)` | Поиск в чате (ILIKE по content). Проверяет членство. |
| `searchGlobalMessages(userId, query, limit?, offset?)` | Глобальный поиск по всем чатам пользователя. |
| `getChatMedia(chatId, userId, type?, limit?, offset?)` | Медиа-галерея: сообщения с вложениями, фильтр по MIME-типу. |
| `getChatMediaStats(chatId, userId)` | Статистика медиа: количество images, videos, audio, documents, total. |
| `getUnreadCount(chatId, userId)` | Подсчет непрочитанных сообщений (используется другими модулями). |
| `getScheduledMessages(chatId, userId)` | Запланированные сообщения пользователя в чате. |
| `cancelScheduledMessage(messageId, userId)` | Отмена запланированного сообщения (hard delete). Только автор. |
| `markMessageOpened(messageId, userId)` | Запуск таймера самоуничтожения. Только получатель (не отправитель) может активировать. Устанавливает `selfDestructAt`. |

---

## DTO

### MessageDto

Основной DTO сообщения. Создается через `MessageDto.fromEntity(entity)`.

**Поля:**
- Все поля entity: `id`, `chatId`, `senderId`, `type`, `status`, `content`, `replyToId`, `forwardedFromId`, `isEdited`, `isDeleted`, `isPinned`, `pinnedAt`, `pinnedById`, `stickerId`, `encryptedContent`, `encryptionMetadata`, `keyboard`, `linkPreviews`, `scheduledAt`, `isScheduled`, `selfDestructSeconds`, `selfDestructAt`, `createdAt`, `updatedAt`
- `sender` — объект `{ id, firstName, lastName, avatarUrl }` (из User + Profile)
- `replyTo` — вложенный `MessageDto` (если есть ответ)
- `attachments` — массив `MessageAttachmentDto[]`
- `reactions` — сводка реакций `{ emoji, count, userIds }[]`
- `mentions` — массив `{ userId, isAll }[]`

Для удаленных сообщений `content` всегда возвращается как `null`.

### MessageAttachmentDto

**Поля:** `id`, `fileId`, `fileName`, `fileUrl`, `fileType`, `fileSize`, `thumbnailUrl`, `width`, `height`

### MediaItemDto

Упрощенный DTO для медиа-галереи.

**Поля:** `id`, `messageId`, `chatId`, `senderId`, `attachments[]`, `createdAt`, `sender`

### Интерфейсы

| Интерфейс | Описание |
|-----------|----------|
| `IMessageListDto` | `{ data: MessageDto[], hasMore: boolean }` — cursor-пагинация |
| `IMessageSearchDto` | `{ data: MessageDto[], totalCount: number }` — результат поиска |
| `IMediaGalleryDto` | `{ data: MediaItemDto[], totalCount: number }` — медиа-галерея |
| `IMediaStatsDto` | `{ images, videos, audio, documents, total }` — статистика медиа |

---

## Валидация (Zod-схемы)

### SendMessageSchema

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `type` | `EMessageType` | По умолчанию `TEXT` |
| `content` | `string`, optional | Макс. 4000 символов |
| `replyToId` | `uuid`, optional | UUID |
| `forwardedFromId` | `uuid`, optional | UUID |
| `fileIds` | `uuid[]`, optional | Макс. 10 вложений |
| `mentionedUserIds` | `uuid[]`, optional | Макс. 50 упоминаний |
| `mentionAll` | `boolean`, optional | -- |
| `stickerId` | `uuid`, optional | UUID |
| `encryptedContent` | `string`, optional | -- |
| `encryptionMetadata` | `Record<string, unknown>`, optional | -- |
| `scheduledAt` | `datetime string`, optional | ISO datetime |
| `selfDestructSeconds` | `integer`, optional | Мин. 1, макс. 604800 (7 дней) |

**Refinement:** Обязательно указать `content`, `fileIds` (непустой) или `stickerId`.

### EditMessageSchema
- `content`: `string`, мин. 1, макс. 4000 символов

### MarkReadSchema
- `messageId`: `string`, UUID

### AddReactionSchema
- `emoji`: `string`, мин. 1, макс. 20 символов

---

## События (Events)

Все события передаются через `EventBus` (fire-and-forget, синхронный `emit`).

| Событие | Данные | Когда эмитится |
|---------|--------|----------------|
| `MessageCreatedEvent` | `message`, `chatId`, `memberUserIds`, `mentionedUserIds`, `mentionAll` | Отправка нового сообщения (в т.ч. при срабатывании планировщика) |
| `MessageUpdatedEvent` | `message`, `chatId` | Редактирование сообщения |
| `MessageDeletedEvent` | `messageId`, `chatId` | Удаление сообщения (soft-delete, включая самоуничтожение) |
| `MessageDeliveredEvent` | `messageIds[]`, `chatId`, `userId` | Отметка доставки |
| `MessageReadEvent` | `chatId`, `userId`, `messageId` | Отметка прочтения |
| `MessagePinnedEvent` | `message`, `chatId`, `pinnedByUserId` | Закрепление сообщения |
| `MessageUnpinnedEvent` | `messageId`, `chatId` | Открепление сообщения |
| `MessageReactionEvent` | `messageId`, `chatId`, `userId`, `emoji` (null при удалении) | Добавление/удаление реакции |

---

## Socket-интеграция

### MessageHandler (входящие события от клиента)

Обрабатывает события от подключенных клиентов через Socket.IO:

| Входящее событие | Данные | Действие |
|------------------|--------|----------|
| `message:read` | `{ chatId, messageId }` | Вызывает `MessageService.markAsRead()` |
| `message:delivered` | `{ chatId, messageIds }` | Вызывает `MessageService.markAsDelivered()` |

Ошибки в socket-обработчиках молча игнорируются (пользователь может не быть участником чата).

### MessageListener (исходящие события клиентам)

Слушает доменные события через `EventBus` и транслирует их в Socket.IO:

| Доменное событие | Socket-событие | Комната/адресат | Payload |
|------------------|---------------|-----------------|---------|
| `MessageCreatedEvent` | `message:new` | `chat_{chatId}` | `MessageDto` |
| `MessageCreatedEvent` | `chat:unread` | Каждый участник (кроме отправителя) | `{ chatId, unreadCount: -1 }` |
| `MessageUpdatedEvent` | `message:updated` | `chat_{chatId}` | `MessageDto` |
| `MessageDeletedEvent` | `message:deleted` | `chat_{chatId}` | `{ messageId, chatId }` |
| `MessagePinnedEvent` | `message:pinned` | `chat_{chatId}` | `MessageDto` |
| `MessageUnpinnedEvent` | `message:unpinned` | `chat_{chatId}` | `{ messageId, chatId }` |
| `MessageReactionEvent` | `message:reaction` | `chat_{chatId}` | `{ messageId, chatId, userId, emoji }` |
| `MessageDeliveredEvent` | `message:status` | `chat_{chatId}` | `{ messageId, chatId, status: "delivered" }` (для каждого messageId) |
| `MessageReadEvent` | `chat:unread` | `chat_{chatId}` | `{ chatId, unreadCount: 0 }` |

---

## Bootstrap (MessageSchedulerBootstrap)

Фоновый планировщик, запускаемый при старте приложения. Выполняет две задачи с интервалом **10 секунд**:

1. **Обработка запланированных сообщений** (`_processScheduledMessages`):
   - Ищет сообщения с `isScheduled=true` и `scheduledAt <= now`
   - Снимает флаг `isScheduled`
   - Эмитит `MessageCreatedEvent` (как обычная отправка)

2. **Обработка самоуничтожающихся сообщений** (`_processSelfDestructMessages`):
   - Ищет сообщения с `selfDestructAt <= now` и `isDeleted=false`
   - Выполняет soft-delete (обнуляет content, устанавливает `isDeleted=true`)
   - Эмитит `MessageDeletedEvent`

Реализует `IBootstrap` с методами `initialize()` и `destroy()` (graceful shutdown через `clearInterval`).

---

## Зависимости

### Внешние модули (импорт/использование)

| Модуль | Что используется | Зачем |
|--------|-----------------|-------|
| **Chat** | `ChatRepository`, `ChatMemberRepository`, `ChatService` | Проверка членства, прав на отправку, получение участников, обновление `lastMessageAt` |
| **File** | `File` entity | Связь вложений с файлами (через `MessageAttachment.file`) |
| **User** | `User` entity | Связь отправителя, реакций с пользователями |
| **Socket** | `SocketEmitterService`, `ISocketHandler`, `ISocketEventListener` | Realtime-трансляция событий через Socket.IO |
| **LinkPreview** | `LinkPreviewService` | Асинхронное получение превью ссылок из контента сообщения |
| **Core** | `EventBus`, `Injectable`, `InjectableRepository`, `ValidateBody`, `getContextUser`, `BaseRepository`, `BaseDto`, `IBootstrap`, `logger` | Инфраструктура: DI, события, валидация, аутентификация, логирование |

### Кто использует этот модуль

Модуль экспортирует через `index.ts`:
- `MessageService` — может использоваться другими модулями для получения данных о сообщениях (например, `getUnreadCount`)
- `MessageDto`, `MessageCreatedEvent` и другие события — для подписки внешних слушателей
- `Message`, `MessageAttachment` entities — для TypeORM relations

---

## Взаимодействие с другими модулями

```
┌─────────────┐     canSendMessage()      ┌─────────────┐
│   Message    │ ──────────────────────── > │    Chat      │
│   Module     │     isMember()            │   Module     │
│              │     getMemberUserIds()     │              │
│              │     findMembership()       │              │
└──────┬───────┘                           └──────────────┘
       │
       │  EventBus.emit()
       ▼
┌──────────────┐    toRoom() / toUser()   ┌──────────────┐
│   Message    │ ──────────────────────── >│   Socket     │
│   Listener   │                          │   Module     │
└──────────────┘                          └──────────────┘
       ▲
       │  EventBus.on()
       │
┌──────────────┐
│   Message    │  socket.on("message:read")
│   Handler    │  socket.on("message:delivered")
└──────────────┘

┌─────────────┐   getPreviewsForContent() ┌──────────────┐
│   Message    │ ──────────────────────── >│ LinkPreview  │
│   Service    │                          │   Module     │
└──────────────┘                          └──────────────┘

┌─────────────┐   File entity relation    ┌──────────────┐
│ Attachment   │ ──────────────────────── >│    File      │
│   Entity     │                          │   Module     │
└──────────────┘                          └──────────────┘

┌─────────────┐   User entity relation    ┌──────────────┐
│  Message /   │ ──────────────────────── >│    User      │
│  Reaction    │                          │   Module     │
└──────────────┘                          └──────────────┘
```
