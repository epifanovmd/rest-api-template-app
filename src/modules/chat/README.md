# Модуль Chat

Полнофункциональный модуль чатов, реализующий личные, групповые, секретные чаты и каналы. Поддерживает систему участников с ролями, invite-ссылки, папки для организации чатов, модерацию (slow mode, бан участников) и real-time уведомления через Socket.IO.

## Структура файлов

```
src/modules/chat/
├── chat.entity.ts                          # Entity чата
├── chat-member.entity.ts                   # Entity участника чата
├── chat-invite.entity.ts                   # Entity invite-ссылки
├── chat-folder.entity.ts                   # Entity папки чатов
├── chat.types.ts                           # Перечисления EChatType, EChatMemberRole
├── chat.repository.ts                      # Репозиторий чатов
├── chat-member.repository.ts               # Репозиторий участников
├── chat-invite.repository.ts               # Репозиторий invite-ссылок
├── chat-folder.repository.ts               # Репозиторий папок
├── chat.service.ts                         # Основной сервис (CRUD, участники, invite, папки)
├── chat-moderation.service.ts              # Сервис модерации (slow mode, бан)
├── chat.controller.ts                      # REST-контроллер чатов (30 endpoints)
├── chat-moderation.controller.ts           # REST-контроллер модерации (4 endpoints)
├── chat.handler.ts                         # Socket handler (join/leave/typing)
├── chat.listener.ts                        # Socket listener (доменные события -> WS)
├── chat-moderation.listener.ts             # Socket listener модерации
├── chat.module.ts                          # Основной модуль
├── chat-moderation.module.ts               # Модуль модерации
├── index.ts                                # Реэкспорт
├── dto/
│   ├── chat.dto.ts                         # ChatDto, ChatMemberDto, IChatListDto
│   ├── chat-invite.dto.ts                  # ChatInviteDto
│   ├── chat-folder.dto.ts                  # ChatFolderDto
│   └── index.ts
├── events/
│   ├── chat-created.event.ts               # ChatCreatedEvent
│   ├── chat-updated.event.ts               # ChatUpdatedEvent
│   ├── chat-member-joined.event.ts         # ChatMemberJoinedEvent
│   ├── chat-member-left.event.ts           # ChatMemberLeftEvent
│   ├── moderation.event.ts                 # ChatSlowModeEvent, ChatMemberBannedEvent, ChatMemberUnbannedEvent
│   └── index.ts
├── validation/
│   ├── create-direct-chat.validate.ts
│   ├── create-group-chat.validate.ts
│   ├── create-channel.validate.ts
│   ├── create-secret-chat.validate.ts
│   ├── update-chat.validate.ts
│   ├── update-channel.validate.ts
│   ├── add-members.validate.ts
│   ├── update-member-role.validate.ts
│   ├── mute-chat.validate.ts
│   ├── create-invite.validate.ts
│   ├── create-folder.validate.ts
│   ├── move-chat-to-folder.validate.ts
│   ├── moderation.validate.ts
│   └── index.ts
├── chat.service.test.ts
├── chat-moderation.service.test.ts
├── chat.handler.test.ts
├── chat.listener.test.ts
├── chat.service.cascade.test.ts
└── validation/
    └── chat.validation.test.ts
```

## Entities

### Chat (`chats`)

Основная entity чата.

| Поле              | Тип                  | Описание                                      |
|-------------------|----------------------|-----------------------------------------------|
| `id`              | `uuid` (PK)         | Уникальный идентификатор                      |
| `type`            | `enum EChatType`     | Тип чата: `direct`, `group`, `channel`, `secret` |
| `name`            | `varchar(100)?`      | Название (null для direct/secret)             |
| `avatarId`        | `uuid?`              | FK на `File` (аватар)                         |
| `createdById`     | `uuid`               | FK на `User` (создатель)                      |
| `description`     | `varchar(500)?`      | Описание (для каналов)                        |
| `username`        | `varchar(50)?`       | Уникальный username (для каналов)             |
| `isPublic`        | `boolean`            | Публичный ли канал (default: false)           |
| `slowModeSeconds` | `integer`            | Задержка между сообщениями (default: 0)       |
| `lastMessageAt`   | `timestamp?`         | Время последнего сообщения (для сортировки)   |
| `createdAt`       | `timestamp`          | Дата создания                                 |
| `updatedAt`       | `timestamp`          | Дата обновления                               |

**Связи:**
- `ManyToOne` -> `File` (avatar, ON DELETE SET NULL)
- `ManyToOne` -> `User` (createdBy, ON DELETE SET NULL)
- `OneToMany` -> `ChatMember` (members, cascade: true)

**Индексы:**
- `IDX_CHATS_LAST_MESSAGE_AT` — по `lastMessageAt`
- `IDX_CHATS_USERNAME` — уникальный по `username` (WHERE username IS NOT NULL)

### ChatMember (`chat_members`)

Участник чата с ролью и персональными настройками.

| Поле                | Тип                     | Описание                          |
|---------------------|-------------------------|-----------------------------------|
| `id`                | `uuid` (PK)            | Уникальный идентификатор          |
| `chatId`            | `uuid`                 | FK на `Chat`                      |
| `userId`            | `uuid`                 | FK на `User`                      |
| `role`              | `enum EChatMemberRole` | Роль: `owner`, `admin`, `member`, `subscriber` |
| `joinedAt`          | `timestamp`            | Время вступления                  |
| `mutedUntil`        | `timestamp?`           | Мут до указанной даты             |
| `lastReadMessageId` | `uuid?`                | ID последнего прочитанного сообщения |
| `isPinnedChat`      | `boolean`              | Закреплен ли чат (default: false) |
| `pinnedChatAt`      | `timestamp?`           | Время закрепления                 |
| `isArchived`        | `boolean`              | Архивирован ли (default: false)   |
| `folderId`          | `uuid?`                | ID папки                          |

**Связи:**
- `ManyToOne` -> `Chat` (ON DELETE CASCADE)
- `ManyToOne` -> `User` (ON DELETE CASCADE)

**Индексы:**
- `IDX_CHAT_MEMBERS_CHAT_USER` — уникальный по `(chatId, userId)`
- `IDX_CHAT_MEMBERS_USER` — по `userId`

### ChatInvite (`chat_invites`)

Invite-ссылка для вступления в групповой чат или канал.

| Поле          | Тип             | Описание                               |
|---------------|-----------------|----------------------------------------|
| `id`          | `uuid` (PK)    | Уникальный идентификатор               |
| `chatId`      | `uuid`          | FK на `Chat`                           |
| `code`        | `varchar(32)`   | Уникальный код invite-ссылки           |
| `createdById` | `uuid`          | FK на `User` (создатель)               |
| `expiresAt`   | `timestamp?`    | Срок действия (null = бессрочно)       |
| `maxUses`     | `int?`          | Максимум использований (null = без лимита) |
| `useCount`    | `int`           | Количество использований (default: 0)  |
| `isActive`    | `boolean`       | Активна ли ссылка (default: true)      |
| `createdAt`   | `timestamp`     | Дата создания                          |

**Связи:**
- `ManyToOne` -> `Chat` (ON DELETE CASCADE)
- `ManyToOne` -> `User` (ON DELETE CASCADE)

**Индексы:**
- `IDX_CHAT_INVITES_CODE` — уникальный по `code`
- `IDX_CHAT_INVITES_CHAT` — по `chatId`

### ChatFolder (`chat_folders`)

Пользовательская папка для организации чатов.

| Поле        | Тип             | Описание                       |
|-------------|-----------------|--------------------------------|
| `id`        | `uuid` (PK)    | Уникальный идентификатор       |
| `userId`    | `uuid`          | FK на `User`                   |
| `name`      | `varchar(50)`   | Название папки                 |
| `position`  | `integer`       | Порядок сортировки (default: 0)|
| `createdAt` | `timestamp`     | Дата создания                  |
| `updatedAt` | `timestamp`     | Дата обновления                |

**Связи:**
- `ManyToOne` -> `User` (ON DELETE CASCADE)

**Индексы:**
- `IDX_CHAT_FOLDERS_USER` — по `userId`
- `IDX_CHAT_FOLDERS_USER_NAME` — уникальный по `(userId, name)`

## Типы и перечисления

### EChatType
- `direct` — личный чат (2 участника)
- `group` — групповой чат
- `channel` — канал (подписчики не могут писать)
- `secret` — секретный (E2E encrypted) чат

### EChatMemberRole
- `owner` — владелец (полные права)
- `admin` — администратор
- `member` — обычный участник
- `subscriber` — подписчик канала (только чтение)

## Endpoints

### ChatController (`api/chat`)

Все endpoints требуют `@Security("jwt")`.

#### Создание чатов

| Метод  | Путь                        | Описание                                | Валидация              |
|--------|-----------------------------|-----------------------------------------|------------------------|
| POST   | `api/chat/direct`           | Создать или получить личный чат         | `CreateDirectChatSchema` |
| POST   | `api/chat/group`            | Создать групповой чат                   | `CreateGroupChatSchema`  |
| POST   | `api/chat/channel`          | Создать канал                           | `CreateChannelSchema`    |
| POST   | `api/chat/secret`           | Создать секретный (E2E) чат             | `CreateSecretChatSchema` |

#### Получение и обновление

| Метод  | Путь                        | Описание                                | Валидация              |
|--------|-----------------------------|-----------------------------------------|------------------------|
| GET    | `api/chat`                  | Список чатов текущего пользователя (пагинация: `offset`, `limit`) | — |
| GET    | `api/chat/{id}`             | Получить информацию о чате              | — |
| PATCH  | `api/chat/{id}`             | Обновить групповой чат (название, аватар) | `UpdateChatSchema` |
| DELETE | `api/chat/{id}`             | Покинуть чат                            | — |

#### Каналы

| Метод  | Путь                              | Описание                           | Валидация              |
|--------|-----------------------------------|------------------------------------|------------------------|
| PATCH  | `api/chat/channel/{id}`           | Обновить канал                     | `UpdateChannelSchema`  |
| POST   | `api/chat/channel/{id}/subscribe` | Подписаться на публичный канал     | — |
| DELETE | `api/chat/channel/{id}/subscribe` | Отписаться от канала               | — |
| GET    | `api/chat/channel/search`         | Поиск публичных каналов (`q`, `offset`, `limit`) | — |

#### Участники

| Метод  | Путь                                | Описание                          | Валидация                |
|--------|-------------------------------------|-----------------------------------|--------------------------|
| POST   | `api/chat/{id}/members`             | Добавить участников               | `AddMembersSchema`       |
| DELETE | `api/chat/{id}/members/{userId}`    | Удалить участника                 | — |
| PATCH  | `api/chat/{id}/members/{userId}`    | Изменить роль участника           | `UpdateMemberRoleSchema` |

#### Invite-ссылки

| Метод  | Путь                                  | Описание                        | Валидация            |
|--------|---------------------------------------|---------------------------------|----------------------|
| POST   | `api/chat/{id}/invite`                | Создать invite-ссылку           | `CreateInviteSchema` |
| GET    | `api/chat/{id}/invite`                | Получить список invite-ссылок   | — |
| DELETE | `api/chat/{id}/invite/{inviteId}`     | Отозвать invite-ссылку          | — |
| POST   | `api/chat/join/{code}`                | Вступить по invite-коду         | — |

#### Персональные настройки чата

| Метод  | Путь                       | Описание                           | Валидация                |
|--------|----------------------------|------------------------------------|--------------------------|
| PATCH  | `api/chat/{id}/mute`       | Замутить/размутить чат             | `MuteChatSchema`         |
| POST   | `api/chat/{id}/pin`        | Закрепить чат                      | — |
| DELETE | `api/chat/{id}/pin`        | Открепить чат                      | — |
| POST   | `api/chat/{id}/archive`    | Архивировать чат                   | — |
| DELETE | `api/chat/{id}/archive`    | Разархивировать чат                | — |
| PATCH  | `api/chat/{id}/folder`     | Переместить чат в папку            | `MoveChatToFolderSchema` |

#### Папки

| Метод  | Путь                            | Описание               | Валидация            |
|--------|---------------------------------|------------------------|----------------------|
| GET    | `api/chat/folder/list`          | Список папок           | — |
| POST   | `api/chat/folder`               | Создать папку          | `CreateFolderSchema` |
| PATCH  | `api/chat/folder/{folderId}`    | Обновить папку         | — |
| DELETE | `api/chat/folder/{folderId}`    | Удалить папку          | — |

### ChatModerationController (`api/chat`)

Все endpoints требуют `@Security("jwt")`. Доступ только для admin/owner.

| Метод  | Путь                                      | Описание                          | Валидация            |
|--------|--------------------------------------------|-----------------------------------|----------------------|
| PATCH  | `api/chat/{id}/slow-mode`                  | Установить slow mode (0-86400 сек) | `SetSlowModeSchema` |
| POST   | `api/chat/{id}/members/{userId}/ban`       | Заблокировать участника           | `BanMemberSchema`    |
| DELETE | `api/chat/{id}/members/{userId}/ban`       | Разблокировать участника          | — |
| GET    | `api/chat/{id}/members/banned`             | Список заблокированных            | — |

## Сервисы

### ChatService

Основной сервис, содержащий бизнес-логику чатов.

**Создание чатов:**
- `createDirectChat(userId, targetUserId)` — создает личный чат или возвращает существующий. Оба участника получают роль `MEMBER`. Нельзя создать чат с самим собой.
- `createGroupChat(userId, name, memberIds, avatarId?)` — создает групповой чат. Создатель получает роль `OWNER`, остальные — `MEMBER`. Дубликаты memberIds фильтруются.
- `createChannel(userId, data)` — создает канал с опциональными `description`, `username`, `avatarId`, `isPublic`. Проверяет уникальность username.
- `createSecretChat(userId, targetUserId)` — создает секретный (E2E encrypted) чат.

**Получение:**
- `getChatById(chatId, userId)` — возвращает чат с проверкой членства.
- `getUserChats(userId, offset?, limit?)` — список чатов пользователя, отсортированных по `lastMessageAt DESC`.
- `getPublicChannels(query?, offset?, limit?)` — поиск публичных каналов по `name` и `username` (ILIKE).

**Обновление:**
- `updateChat(chatId, userId, data)` — обновляет name/avatar. Только для group/channel. Требует роль admin/owner.
- `updateChannel(chatId, userId, data)` — обновляет все поля канала включая description, username, isPublic.

**Участники:**
- `addMembers(chatId, userId, memberIds)` — добавление участников в групповой чат (только admin/owner). Уже существующие участники игнорируются.
- `removeMember(chatId, userId, targetUserId)` — удаление участника (только admin/owner). Нельзя удалить owner.
- `updateMemberRole(chatId, userId, targetUserId, role)` — изменение роли (только owner).
- `leaveChat(chatId, userId)` — выход из чата. Owner обязан передать права перед выходом, если есть другие участники. Если owner последний — чат удаляется.

**Каналы:**
- `subscribeToChannel(chatId, userId)` — подписка на публичный канал (роль `SUBSCRIBER`).
- `unsubscribeFromChannel(chatId, userId)` — отписка от канала. Owner не может отписаться.

**Invite-ссылки:**
- `createInviteLink(chatId, userId, opts?)` — создание invite с опциональными `expiresAt` и `maxUses`. Генерирует 32-символьный hex-код (crypto.randomBytes(16)). Только для group/channel.
- `joinByInvite(code, userId)` — вступление по invite-коду с проверкой активности, срока и лимита. Инкрементирует `useCount`.
- `revokeInvite(chatId, inviteId, userId)` — деактивация invite-ссылки.
- `getInvites(chatId, userId)` — список активных invite-ссылок (admin/owner).

**Персональные настройки:**
- `muteChat(chatId, userId, mutedUntil)` — мут/размут чата (null для размута).
- `pinChat/unpinChat(chatId, userId)` — закрепление/открепление.
- `archiveChat/unarchiveChat(chatId, userId)` — архивация/разархивация.
- `moveChatToFolder(chatId, userId, folderId)` — перемещение в папку (null для удаления из папки).

**Папки:**
- `createFolder(userId, name)` — создание папки (уникальное имя на пользователя).
- `updateFolder(userId, folderId, data)` — обновление имени/позиции.
- `deleteFolder(userId, folderId)` — удаление папки. Все чаты в ней получают `folderId = null`.
- `getUserFolders(userId)` — список папок, отсортированных по position, затем createdAt.

**Утилиты:**
- `canSendMessage(chatId, userId)` — проверка права на отправку сообщения. В каналах только owner/admin могут писать.
- `isMember(chatId, userId)` — проверка членства.
- `getMemberUserIds(chatId)` — список userId всех участников.

**Внутренние проверки:**
- `assertMembership` — проверка, что пользователь является участником (ForbiddenException).
- `assertAdminOrOwner` — проверка роли admin или owner.
- `assertOwner` — проверка роли owner.

### ChatModerationService

Сервис модерации чатов.

- `setSlowMode(chatId, userId, seconds)` — установка slow mode (0 = отключен, максимум 86400 сек). Только admin/owner.
- `banMember(chatId, userId, targetUserId, duration?, reason?)` — блокировка участника. Удаляет его из чата. Нельзя забанить себя, owner, или admin (если вы не owner).
- `unbanMember(chatId, userId, targetUserId)` — разблокировка участника (только admin/owner).
- `getBannedMembers(chatId, userId)` — список заблокированных (сейчас возвращает пустой массив, placeholder для реализации).

## DTO

### ChatDto

| Поле            | Тип                | Описание                    |
|-----------------|---------------------|-----------------------------|
| `id`            | `string`           | UUID чата                   |
| `type`          | `EChatType`        | Тип чата                    |
| `name`          | `string \| null`   | Название                    |
| `description`   | `string \| null`   | Описание                    |
| `username`      | `string \| null`   | Username канала              |
| `isPublic`      | `boolean`          | Публичный ли канал          |
| `avatarUrl`     | `string \| null`   | URL аватара (из связи File) |
| `createdById`   | `string`           | UUID создателя              |
| `lastMessageAt` | `Date \| null`     | Время последнего сообщения  |
| `createdAt`     | `Date`             | Дата создания               |
| `updatedAt`     | `Date`             | Дата обновления             |
| `members`       | `ChatMemberDto[]`  | Список участников           |

### ChatMemberDto

| Поле           | Тип                   | Описание                     |
|----------------|-----------------------|------------------------------|
| `id`           | `string`             | UUID записи членства         |
| `userId`       | `string`             | UUID пользователя            |
| `role`         | `EChatMemberRole`    | Роль участника               |
| `joinedAt`     | `Date`               | Время вступления             |
| `mutedUntil`   | `Date \| null`       | Мут до указанной даты        |
| `isPinnedChat` | `boolean`            | Закреплен ли чат             |
| `isArchived`   | `boolean`            | Архивирован ли               |
| `folderId`     | `string \| null`     | ID папки                     |
| `profile`      | `PublicProfileDto?`  | Профиль пользователя (опционально) |

### ChatInviteDto

| Поле          | Тип               | Описание                      |
|---------------|--------------------|-------------------------------|
| `id`          | `string`          | UUID invite                   |
| `chatId`      | `string`          | UUID чата                     |
| `code`        | `string`          | Invite-код                    |
| `createdById` | `string`          | UUID создателя                |
| `expiresAt`   | `Date \| null`    | Срок действия                 |
| `maxUses`     | `number \| null`  | Лимит использований           |
| `useCount`    | `number`          | Текущее количество использований |
| `isActive`    | `boolean`         | Активна ли ссылка             |
| `createdAt`   | `Date`            | Дата создания                 |

### ChatFolderDto

| Поле        | Тип       | Описание             |
|-------------|-----------|----------------------|
| `id`        | `string` | UUID папки           |
| `userId`    | `string` | UUID пользователя    |
| `name`      | `string` | Название             |
| `position`  | `number` | Порядок сортировки   |
| `createdAt` | `Date`   | Дата создания        |
| `updatedAt` | `Date`   | Дата обновления      |

### IChatListDto

Интерфейс пагинированного списка, расширяет `IListResponseDto<ChatDto[]>`:
- `offset` — смещение
- `limit` — лимит
- `count` — количество элементов на текущей странице
- `totalCount` — общее количество
- `data` — массив `ChatDto`

## События (Events)

Доменные события, эмитируемые через `EventBus`.

### Основные события чата

| Событие                | Payload                                         | Когда эмитируется                         |
|------------------------|-------------------------------------------------|-------------------------------------------|
| `ChatCreatedEvent`     | `chat: Chat`, `memberUserIds: string[]`         | При создании любого типа чата             |
| `ChatUpdatedEvent`     | `chat: Chat`                                    | При обновлении чата (название, аватар и т.д.) |
| `ChatMemberJoinedEvent`| `chatId`, `userId`, `memberUserIds: string[]`   | При добавлении участника или подписке     |
| `ChatMemberLeftEvent`  | `chatId`, `userId`, `memberUserIds: string[]`   | При выходе/удалении участника или отписке |

### События модерации

| Событие                 | Payload                                                            | Когда эмитируется          |
|-------------------------|--------------------------------------------------------------------|----------------------------|
| `ChatSlowModeEvent`     | `chatId`, `seconds`, `userId`                                      | При изменении slow mode    |
| `ChatMemberBannedEvent` | `chatId`, `targetUserId`, `bannedByUserId`, `duration?`, `reason?` | При блокировке участника   |
| `ChatMemberUnbannedEvent`| `chatId`, `targetUserId`, `unbannedByUserId`                      | При разблокировке участника |

## Socket-интеграция

### Входящие события (клиент -> сервер)

Обрабатываются в `ChatHandler`:

| Событие        | Payload           | Описание                                                  |
|----------------|-------------------|-----------------------------------------------------------|
| `chat:join`    | `{ chatId }`      | Подключение к комнате чата (с проверкой членства)         |
| `chat:leave`   | `{ chatId }`      | Отключение от комнаты чата                                |
| `chat:typing`  | `{ chatId }`      | Уведомление о наборе текста (broadcast в комнату чата)    |

### Исходящие события (сервер -> клиент)

Отправляются через `ChatListener` и `ChatModerationListener`:

| Событие              | Получатели                | Payload                                        |
|----------------------|---------------------------|------------------------------------------------|
| `chat:created`       | Каждому участнику (toUser)| `ChatDto`                                      |
| `chat:updated`       | Комната чата (toRoom)     | `ChatDto`                                      |
| `chat:member:joined` | Каждому участнику (toUser)| `{ chatId, userId }`                           |
| `chat:member:left`   | Каждому участнику (toUser)| `{ chatId, userId }`                           |
| `chat:typing`        | Комната чата (broadcast)  | `{ chatId, userId }`                           |
| `chat:slow-mode`     | Комната чата (toRoom)     | `{ chatId, seconds }`                          |
| `chat:member:banned` | Комната чата (toRoom)     | `{ chatId, userId, bannedBy, reason }`         |
| `chat:member:unbanned`| Комната чата (toRoom)    | `{ chatId, userId }`                           |

Комнаты Socket.IO формируются по шаблону `chat_{chatId}`.

## Валидация (Zod-схемы)

| Схема                    | Поля                                                               |
|--------------------------|--------------------------------------------------------------------|
| `CreateDirectChatSchema` | `targetUserId: uuid`                                               |
| `CreateGroupChatSchema`  | `name: string(1-100)`, `memberIds: uuid[] (min 1)`, `avatarId?: uuid` |
| `CreateChannelSchema`    | `name: string(1-100)`, `description?: string(max 500)`, `username?: regex(3-50, [a-zA-Z0-9_])`, `avatarId?: uuid`, `isPublic: boolean(default false)` |
| `CreateSecretChatSchema` | `targetUserId: uuid`                                               |
| `UpdateChatSchema`       | `name?: string(1-100)`, `avatarId?: uuid \| null`                  |
| `UpdateChannelSchema`    | `name?: string(1-100)`, `description?: string(max 500) \| null`, `username?: regex \| null`, `avatarId?: uuid \| null`, `isPublic?: boolean` |
| `AddMembersSchema`       | `memberIds: uuid[] (min 1)`                                       |
| `UpdateMemberRoleSchema` | `role: EChatMemberRole`                                            |
| `MuteChatSchema`         | `mutedUntil: datetime \| null`                                     |
| `CreateInviteSchema`     | `expiresAt?: datetime`, `maxUses?: int (positive)`                 |
| `CreateFolderSchema`     | `name: string(1-50)`                                               |
| `MoveChatToFolderSchema` | `folderId: uuid \| null`                                           |
| `SetSlowModeSchema`      | `seconds: int(0-86400)`                                            |
| `BanMemberSchema`        | `duration?: int(min 0)`, `reason?: string(max 500)`                |

## Модули

### ChatModule

Регистрирует основные провайдеры:
- `ChatRepository`, `ChatMemberRepository`, `ChatInviteRepository`, `ChatFolderRepository`
- `ChatService`
- `ChatController`
- `ChatHandler` (как socket handler через `asSocketHandler`)
- `ChatListener` (как socket listener через `asSocketListener`)

### ChatModerationModule

Регистрирует провайдеры модерации:
- `ChatModerationService`
- `ChatModerationController`
- `ChatModerationListener` (как socket listener через `asSocketListener`)

Модуль модерации использует `ChatRepository` и `ChatMemberRepository` из основного `ChatModule`, но не импортирует его явно — эти репозитории доступны через `@InjectableRepository`, который автоматически биндится через `toDynamicValue`.

## Зависимости

### Внешние модули и entity

- **User** (`../user/user.entity`) — связь через `createdBy` в `Chat`, `user` в `ChatMember`, `user` в `ChatFolder`, `createdBy` в `ChatInvite`
- **File** (`../file/file.entity`) — связь через `avatar` в `Chat`
- **Profile** (`../profile/dto`) — `PublicProfileDto` используется в `ChatMemberDto` для отображения профиля участника
- **Socket** (`../socket`) — `ISocketHandler`, `ISocketEventListener`, `SocketEmitterService`, `TSocket`, хелперы `asSocketHandler`/`asSocketListener`

### Core-зависимости

- `EventBus` — для эмиссии доменных событий
- `Injectable`, `InjectableRepository` — IoC маркеры
- `ValidateBody` — декоратор валидации тела запроса через Zod
- `getContextUser` — извлечение текущего пользователя из Koa context
- `BaseRepository` — базовый класс репозитория
- `BaseDto` — базовый класс DTO
- `IListResponseDto` — интерфейс пагинированного ответа
- Исключения: `BadRequestException`, `ForbiddenException`, `NotFoundException` (из `@force-dev/utils`)

## Взаимодействие с другими модулями

- **Message модуль** — использует `ChatService.canSendMessage()` для проверки права на отправку сообщений, обновляет `lastMessageAt` в entity `Chat`
- **Socket модуль** — `ChatHandler` регистрируется как socket handler для обработки входящих WS-событий; `ChatListener` и `ChatModerationListener` регистрируются как socket event listeners для рассылки уведомлений
- **Profile модуль** — профили пользователей загружаются через relation `user.profile` и отображаются в `ChatMemberDto`
- **File модуль** — аватары чатов хранятся как ссылки на entity `File`, URL аватара маппится в `ChatDto.avatarUrl`
