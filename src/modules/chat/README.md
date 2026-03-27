# Модуль Chat

Полнофункциональный модуль чатов, реализующий личные, групповые, секретные чаты и каналы. Поддерживает систему участников с ролями, invite-ссылки, папки для организации чатов, модерацию (slow mode, бан участников) и real-time уведомления через Socket.IO.

---

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
├── chat.controller.ts                      # REST-контроллер чатов
├── chat-moderation.controller.ts           # REST-контроллер модерации
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
│   ├── chat-member-role-changed.event.ts   # ChatMemberRoleChangedEvent
│   ├── chat-pinned.event.ts                # ChatPinnedEvent
│   ├── chat-archived.event.ts              # ChatArchivedEvent
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
├── chat.service.cascade.test.ts
├── chat-moderation.service.test.ts
├── chat.handler.test.ts
├── chat.listener.test.ts
└── validation/chat.validation.test.ts
    └── dto/chat.dto.test.ts
```

---

## Entities

### Chat (`chats`)

Основная entity чата.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `type` | `enum EChatType` | Тип чата: `direct`, `group`, `channel`, `secret` |
| `name` | `varchar(100)`, nullable | Название (null для direct/secret) |
| `avatarId` | `uuid`, nullable | FK на `File` (аватар) |
| `createdById` | `uuid`, nullable | FK на `User` (создатель) |
| `description` | `varchar(500)`, nullable | Описание (для каналов) |
| `username` | `varchar(50)`, nullable, unique | Уникальный username (для каналов) |
| `isPublic` | `boolean` | Публичный ли канал (default: false) |
| `slowModeSeconds` | `integer` | Задержка между сообщениями (default: 0) |
| `lastMessageAt` | `timestamp`, nullable | Время последнего сообщения (для сортировки) |
| `createdAt` | `timestamp` | Дата создания |
| `updatedAt` | `timestamp` | Дата обновления |

**Связи:**
- `ManyToOne` -> `File` (avatar, ON DELETE SET NULL)
- `ManyToOne` -> `User` (createdBy, ON DELETE SET NULL)
- `OneToMany` -> `ChatMember[]` (members, cascade: true)

**Индексы:**
- `IDX_CHATS_LAST_MESSAGE_AT` -- по `lastMessageAt`
- `IDX_CHATS_USERNAME` -- уникальный по `username` (WHERE username IS NOT NULL)

---

### ChatMember (`chat_members`)

Участник чата с ролью и персональными настройками.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `chatId` | `uuid` | FK на `Chat` |
| `userId` | `uuid` | FK на `User` |
| `role` | `enum EChatMemberRole` | Роль: `owner`, `admin`, `member`, `subscriber` |
| `joinedAt` | `timestamp` | Время вступления (default: CURRENT_TIMESTAMP) |
| `mutedUntil` | `timestamp`, nullable | Мут до указанной даты |
| `lastReadMessageId` | `uuid`, nullable | ID последнего прочитанного сообщения |
| `isPinnedChat` | `boolean` | Закреплен ли чат (default: false) |
| `pinnedChatAt` | `timestamp`, nullable | Время закрепления |
| `isArchived` | `boolean` | Архивирован ли (default: false) |
| `folderId` | `uuid`, nullable | ID папки |

**Связи:**
- `ManyToOne` -> `Chat` (ON DELETE CASCADE)
- `ManyToOne` -> `User` (ON DELETE CASCADE)

**Индексы:**
- `IDX_CHAT_MEMBERS_CHAT_USER` -- уникальный по `(chatId, userId)`
- `IDX_CHAT_MEMBERS_USER` -- по `userId`

---

### ChatInvite (`chat_invites`)

Invite-ссылка для вступления в групповой чат или канал.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `chatId` | `uuid` | FK на `Chat` |
| `code` | `varchar(32)`, unique | Уникальный код invite-ссылки |
| `createdById` | `uuid` | FK на `User` (создатель) |
| `expiresAt` | `timestamp`, nullable | Срок действия (null = бессрочно) |
| `maxUses` | `int`, nullable | Максимум использований (null = без лимита) |
| `useCount` | `int` | Количество использований (default: 0) |
| `isActive` | `boolean` | Активна ли ссылка (default: true) |
| `createdAt` | `timestamp` | Дата создания |

**Связи:**
- `ManyToOne` -> `Chat` (ON DELETE CASCADE)
- `ManyToOne` -> `User` (ON DELETE CASCADE)

**Индексы:**
- `IDX_CHAT_INVITES_CODE` -- уникальный по `code`
- `IDX_CHAT_INVITES_CHAT` -- по `chatId`

---

### ChatFolder (`chat_folders`)

Пользовательская папка для организации чатов.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `userId` | `uuid` | FK на `User` |
| `name` | `varchar(50)` | Название папки |
| `position` | `integer` | Порядок сортировки (default: 0) |
| `createdAt` | `timestamp` | Дата создания |
| `updatedAt` | `timestamp` | Дата обновления |

**Связи:**
- `ManyToOne` -> `User` (ON DELETE CASCADE)

**Индексы:**
- `IDX_CHAT_FOLDERS_USER` -- по `userId`
- `IDX_CHAT_FOLDERS_USER_NAME` -- уникальный по `(userId, name)`

---

## Типы и перечисления

### EChatType
| Значение | Описание |
|----------|----------|
| `direct` | Личный чат (2 участника) |
| `group` | Групповой чат |
| `channel` | Канал (подписчики не могут писать) |
| `secret` | Секретный (E2E encrypted) чат |

### EChatMemberRole
| Значение | Описание |
|----------|----------|
| `owner` | Владелец (полные права) |
| `admin` | Администратор |
| `member` | Обычный участник |
| `subscriber` | Подписчик канала (только чтение) |

---

## Endpoints

### ChatController (`api/chat`)

Все endpoints требуют `@Security("jwt")`.

#### Создание чатов

| Метод | Путь | Описание | Валидация |
|-------|------|----------|-----------|
| POST | `api/chat/direct` | Создать или получить личный чат | `CreateDirectChatSchema` |
| POST | `api/chat/group` | Создать групповой чат | `CreateGroupChatSchema` |
| POST | `api/chat/channel` | Создать канал | `CreateChannelSchema` |
| POST | `api/chat/secret` | Создать секретный (E2E) чат | `CreateSecretChatSchema` |

#### Получение и обновление

| Метод | Путь | Описание | Валидация |
|-------|------|----------|-----------|
| GET | `api/chat?offset=&limit=` | Список чатов текущего пользователя | -- |
| GET | `api/chat/{id}` | Получить информацию о чате | -- |
| PATCH | `api/chat/{id}` | Обновить групповой чат (название, аватар) | `UpdateChatSchema` |
| DELETE | `api/chat/{id}` | Покинуть чат | -- |

#### Каналы

| Метод | Путь | Описание | Валидация |
|-------|------|----------|-----------|
| PATCH | `api/chat/channel/{id}` | Обновить канал | `UpdateChannelSchema` |
| POST | `api/chat/channel/{id}/subscribe` | Подписаться на публичный канал | -- |
| DELETE | `api/chat/channel/{id}/subscribe` | Отписаться от канала | -- |
| GET | `api/chat/channel/search?q=&offset=&limit=` | Поиск публичных каналов | -- |

#### Участники

| Метод | Путь | Описание | Валидация |
|-------|------|----------|-----------|
| POST | `api/chat/{id}/members` | Добавить участников | `AddMembersSchema` |
| DELETE | `api/chat/{id}/members/{userId}` | Удалить участника | -- |
| PATCH | `api/chat/{id}/members/{userId}` | Изменить роль участника | `UpdateMemberRoleSchema` |

#### Invite-ссылки

| Метод | Путь | Описание | Валидация |
|-------|------|----------|-----------|
| POST | `api/chat/{id}/invite` | Создать invite-ссылку | `CreateInviteSchema` |
| GET | `api/chat/{id}/invite` | Получить список invite-ссылок | -- |
| DELETE | `api/chat/{id}/invite/{inviteId}` | Отозвать invite-ссылку | -- |
| POST | `api/chat/join/{code}` | Вступить по invite-коду | -- |

#### Персональные настройки чата

| Метод | Путь | Описание | Валидация |
|-------|------|----------|-----------|
| PATCH | `api/chat/{id}/mute` | Замутить/размутить чат | `MuteChatSchema` |
| POST | `api/chat/{id}/pin` | Закрепить чат | -- |
| DELETE | `api/chat/{id}/pin` | Открепить чат | -- |
| POST | `api/chat/{id}/archive` | Архивировать чат | -- |
| DELETE | `api/chat/{id}/archive` | Разархивировать чат | -- |
| PATCH | `api/chat/{id}/folder` | Переместить чат в папку | `MoveChatToFolderSchema` |

#### Папки

| Метод | Путь | Описание | Валидация |
|-------|------|----------|-----------|
| GET | `api/chat/folder/list` | Список папок | -- |
| POST | `api/chat/folder` | Создать папку | `CreateFolderSchema` |
| PATCH | `api/chat/folder/{folderId}` | Обновить папку | -- |
| DELETE | `api/chat/folder/{folderId}` | Удалить папку | -- |

### ChatModerationController (`api/chat`)

Все endpoints требуют `@Security("jwt")`. Доступ только для admin/owner. Tags: `Chat Moderation`.

| Метод | Путь | Описание | Валидация |
|-------|------|----------|-----------|
| PATCH | `api/chat/{id}/slow-mode` | Установить slow mode (0-86400 сек) | `SetSlowModeSchema` |
| POST | `api/chat/{id}/members/{userId}/ban` | Заблокировать участника | `BanMemberSchema` |
| DELETE | `api/chat/{id}/members/{userId}/ban` | Разблокировать участника | -- |
| GET | `api/chat/{id}/members/banned` | Список заблокированных | -- |

---

## Сервисы

### ChatService

Основной сервис, содержащий бизнес-логику чатов.

#### Зависимости конструктора

- `ChatRepository`
- `ChatMemberRepository`
- `ChatInviteRepository`
- `ChatFolderRepository`
- `EventBus`
- `DataSource` (TypeORM, для транзакций)

#### Создание чатов

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `createDirectChat` | `(userId: string, targetUserId: string): Promise<ChatDto>` | Создает личный чат или возвращает существующий. Оба участника получают роль `MEMBER`. Нельзя создать чат с самим собой. Использует транзакцию с double-check для предотвращения race condition. Эмитит `ChatCreatedEvent`. |
| `createGroupChat` | `(userId: string, name: string, memberIds: string[], avatarId?: string): Promise<ChatDto>` | Создает групповой чат в транзакции. Создатель получает роль `OWNER`, остальные -- `MEMBER`. Дубликаты memberIds фильтруются. Эмитит `ChatCreatedEvent`. |
| `createChannel` | `(userId: string, data: {...}): Promise<ChatDto>` | Создает канал с опциональными `description`, `username`, `avatarId`, `isPublic`. Проверяет уникальность username. Создатель -- `OWNER`. Эмитит `ChatCreatedEvent`. |
| `createSecretChat` | `(userId: string, targetUserId: string): Promise<ChatDto>` | Создает секретный (E2E encrypted) чат. Оба участника -- `MEMBER`. Нельзя создать с самим собой. Эмитит `ChatCreatedEvent`. |

#### Получение

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `getChatById` | `(chatId: string, userId: string): Promise<ChatDto>` | Возвращает чат с проверкой членства. |
| `getUserChats` | `(userId: string, offset?: number, limit?: number): Promise<[Chat[], number]>` | Список чатов пользователя, отсортированных по `lastMessageAt DESC NULLS LAST`, затем `createdAt DESC`. |
| `getPublicChannels` | `(query?: string, offset?: number, limit?: number): Promise<[Chat[], number]>` | Поиск публичных каналов по `name` и `username` (ILIKE). |

#### Обновление

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `updateChat` | `(chatId: string, userId: string, data: {...}): Promise<ChatDto>` | Обновляет name/avatarId. Только для group/channel. Требует роль admin/owner. Эмитит `ChatUpdatedEvent`. |
| `updateChannel` | `(chatId: string, userId: string, data: {...}): Promise<ChatDto>` | Обновляет все поля канала: name, description, username, avatarId, isPublic. Проверяет уникальность username. Эмитит `ChatUpdatedEvent`. |

#### Участники

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `addMembers` | `(chatId: string, userId: string, memberIds: string[]): Promise<ChatMember[]>` | Добавление участников в групповой чат (только admin/owner). Уже существующие участники игнорируются. Эмитит `ChatMemberJoinedEvent` для каждого нового участника. |
| `removeMember` | `(chatId: string, userId: string, targetUserId: string): Promise<string>` | Удаление участника (только admin/owner). Нельзя удалить owner. Эмитит `ChatMemberLeftEvent`. |
| `updateMemberRole` | `(chatId: string, userId: string, targetUserId: string, role: EChatMemberRole): Promise<ChatMember>` | Изменение роли (только owner). Эмитит `ChatMemberRoleChangedEvent`. |
| `leaveChat` | `(chatId: string, userId: string): Promise<string>` | Выход из чата. Owner обязан передать права перед выходом, если есть другие участники. Если owner последний -- чат удаляется. Эмитит `ChatMemberLeftEvent`. |

#### Каналы

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `subscribeToChannel` | `(chatId: string, userId: string): Promise<ChatDto>` | Подписка на публичный канал (роль `SUBSCRIBER`). Эмитит `ChatMemberJoinedEvent`. |
| `unsubscribeFromChannel` | `(chatId: string, userId: string): Promise<string>` | Отписка от канала. Owner не может отписаться. Эмитит `ChatMemberLeftEvent`. |

#### Invite-ссылки

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `createInviteLink` | `(chatId: string, userId: string, opts?: {...}): Promise<ChatInviteDto>` | Создание invite с опциональными `expiresAt` и `maxUses`. Генерирует 32-символьный hex-код (`crypto.randomBytes(16)`). Только для group/channel, только admin/owner. |
| `joinByInvite` | `(code: string, userId: string): Promise<ChatDto>` | Вступление по invite-коду с проверкой активности, срока и лимита. Инкрементирует `useCount` в транзакции. |
| `revokeInvite` | `(chatId: string, inviteId: string, userId: string): Promise<void>` | Деактивация invite-ссылки (устанавливает `isActive=false`). Только admin/owner. |
| `getInvites` | `(chatId: string, userId: string): Promise<ChatInviteDto[]>` | Список активных invite-ссылок (admin/owner). |

#### Персональные настройки

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `muteChat` | `(chatId: string, userId: string, mutedUntil: Date \| null): Promise<ChatMember>` | Мут/размут чата (null для размута). |
| `pinChat` | `(chatId: string, userId: string): Promise<ChatMember>` | Закрепление чата. Эмитит `ChatPinnedEvent` с `isPinned=true`. |
| `unpinChat` | `(chatId: string, userId: string): Promise<ChatMember>` | Открепление чата. Эмитит `ChatPinnedEvent` с `isPinned=false`. |
| `archiveChat` | `(chatId: string, userId: string): Promise<ChatMember>` | Архивация чата. Эмитит `ChatArchivedEvent` с `isArchived=true`. |
| `unarchiveChat` | `(chatId: string, userId: string): Promise<ChatMember>` | Разархивация чата. Эмитит `ChatArchivedEvent` с `isArchived=false`. |
| `moveChatToFolder` | `(chatId: string, userId: string, folderId: string \| null): Promise<ChatMember>` | Перемещение в папку (null для удаления из папки). Проверяет существование папки. |

#### Папки

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `createFolder` | `(userId: string, name: string): Promise<ChatFolderDto>` | Создание папки (уникальное имя на пользователя). |
| `updateFolder` | `(userId: string, folderId: string, data: {...}): Promise<ChatFolderDto>` | Обновление имени/позиции. |
| `deleteFolder` | `(userId: string, folderId: string): Promise<void>` | Удаление папки. Все чаты в ней получают `folderId = null`. |
| `getUserFolders` | `(userId: string): Promise<ChatFolderDto[]>` | Список папок, отсортированных по position ASC, затем createdAt ASC. |

#### Утилиты

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `canSendMessage` | `(chatId: string, userId: string): Promise<boolean>` | Проверка права на отправку сообщения. В каналах только owner/admin могут писать. |
| `isMember` | `(chatId: string, userId: string): Promise<boolean>` | Проверка членства. |
| `getMemberUserIds` | `(chatId: string): Promise<string[]>` | Список userId всех участников. |

#### Внутренние проверки (private)

- `assertMembership(chatId, userId)` -- проверка, что пользователь является участником (`ForbiddenException`)
- `assertAdminOrOwner(chatId, userId)` -- проверка роли admin или owner
- `assertOwner(chatId, userId)` -- проверка роли owner

---

### ChatModerationService

Сервис модерации чатов.

#### Зависимости конструктора

- `ChatRepository`
- `ChatMemberRepository`
- `EventBus`

#### Методы

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `setSlowMode` | `(chatId: string, userId: string, seconds: number): Promise<{chatId, slowModeSeconds}>` | Установка slow mode (0 = отключен, максимум 86400 сек). Только admin/owner. Эмитит `ChatSlowModeEvent`. |
| `banMember` | `(chatId: string, userId: string, targetUserId: string, duration?: number, reason?: string): Promise<void>` | Блокировка участника. Удаляет его из чата. Нельзя забанить себя, owner, или admin (если вы не owner). Эмитит `ChatMemberBannedEvent`. |
| `unbanMember` | `(chatId: string, userId: string, targetUserId: string): Promise<void>` | Разблокировка участника -- создает новое membership с ролью `MEMBER`. Только admin/owner. Эмитит `ChatMemberUnbannedEvent`. |
| `getBannedMembers` | `(chatId: string, userId: string): Promise<[]>` | Список заблокированных (сейчас возвращает пустой массив, placeholder). Только admin/owner. |

---

## Репозитории

### ChatRepository

| Метод | Описание |
|-------|----------|
| `findById(id: string)` | Находит чат с relations: members.user.profile, avatar |
| `findDirectChat(userId1, userId2)` | Ищет существующий direct-чат между двумя пользователями |
| `findUserChats(userId, offset?, limit?)` | Список чатов пользователя с members, profile, avatar. Сортировка: `lastMessageAt DESC NULLS LAST`, `createdAt DESC`. Возвращает `[chats, count]` |
| `findPublicChannels(query?, offset?, limit?)` | Поиск публичных каналов по name/username (ILIKE). Возвращает `[chats, count]` |
| `findByUsername(username: string)` | Поиск чата по username с relations |

### ChatMemberRepository

| Метод | Описание |
|-------|----------|
| `findMembership(chatId, userId)` | Находит membership по chatId + userId |
| `findChatMembers(chatId)` | Все участники чата с relation user.profile |
| `countMembers(chatId)` | Количество участников |
| `getMemberUserIds(chatId)` | Массив userId всех участников |

### ChatInviteRepository

| Метод | Описание |
|-------|----------|
| `findByCode(code: string)` | Находит invite по коду с relation chat |
| `findByChatId(chatId: string)` | Все активные invite чата, отсортированные по createdAt DESC |

### ChatFolderRepository

| Метод | Описание |
|-------|----------|
| `findByUser(userId: string)` | Все папки пользователя, отсортированные по position ASC, createdAt ASC |

---

## DTO

### ChatDto

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `string` | UUID чата |
| `type` | `EChatType` | Тип чата |
| `name` | `string \| null` | Название |
| `description` | `string \| null` | Описание |
| `username` | `string \| null` | Username канала |
| `isPublic` | `boolean` | Публичный ли канал |
| `avatarUrl` | `string \| null` | URL аватара (из связи File) |
| `createdById` | `string \| null` | UUID создателя |
| `slowModeSeconds` | `number` | Задержка slow mode |
| `lastMessageAt` | `Date \| null` | Время последнего сообщения |
| `createdAt` | `Date` | Дата создания |
| `updatedAt` | `Date` | Дата обновления |
| `members` | `ChatMemberDto[]` | Список участников |

### ChatMemberDto

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `string` | UUID записи членства |
| `userId` | `string` | UUID пользователя |
| `role` | `EChatMemberRole` | Роль участника |
| `joinedAt` | `Date` | Время вступления |
| `mutedUntil` | `Date \| null` | Мут до указанной даты |
| `lastReadMessageId` | `string \| null` | ID последнего прочитанного |
| `isPinnedChat` | `boolean` | Закреплен ли чат |
| `pinnedChatAt` | `Date \| null` | Время закрепления |
| `isArchived` | `boolean` | Архивирован ли |
| `folderId` | `string \| null` | ID папки |
| `profile` | `PublicProfileDto?` | Профиль пользователя (опционально) |

### ChatInviteDto

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `string` | UUID invite |
| `chatId` | `string` | UUID чата |
| `code` | `string` | Invite-код |
| `createdById` | `string` | UUID создателя |
| `expiresAt` | `Date \| null` | Срок действия |
| `maxUses` | `number \| null` | Лимит использований |
| `useCount` | `number` | Текущее количество использований |
| `isActive` | `boolean` | Активна ли ссылка |
| `createdAt` | `Date` | Дата создания |

### ChatFolderDto

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `string` | UUID папки |
| `userId` | `string` | UUID пользователя |
| `name` | `string` | Название |
| `position` | `number` | Порядок сортировки |
| `createdAt` | `Date` | Дата создания |
| `updatedAt` | `Date` | Дата обновления |

### IChatListDto

Интерфейс пагинированного списка, расширяет `IListResponseDto<ChatDto[]>`:
- `offset` -- смещение
- `limit` -- лимит
- `count` -- количество элементов на текущей странице
- `totalCount` -- общее количество
- `data` -- массив `ChatDto`

---

## События (Events)

Доменные события, эмитируемые через `EventBus`.

### Основные события чата

| Событие | Payload | Когда эмитируется |
|---------|---------|-------------------|
| `ChatCreatedEvent` | `chat: Chat`, `memberUserIds: string[]` | При создании любого типа чата |
| `ChatUpdatedEvent` | `chat: Chat` | При обновлении чата (название, аватар и т.д.) |
| `ChatMemberJoinedEvent` | `chatId: string`, `userId: string`, `memberUserIds: string[]` | При добавлении участника или подписке на канал |
| `ChatMemberLeftEvent` | `chatId: string`, `userId: string`, `memberUserIds: string[]` | При выходе/удалении участника или отписке от канала |
| `ChatMemberRoleChangedEvent` | `chatId: string`, `userId: string`, `role: string`, `changedBy: string` | При изменении роли участника |
| `ChatPinnedEvent` | `chatId: string`, `userId: string`, `isPinned: boolean` | При закреплении/откреплении чата |
| `ChatArchivedEvent` | `chatId: string`, `userId: string`, `isArchived: boolean` | При архивации/разархивации чата |

### События модерации

| Событие | Payload | Когда эмитируется |
|---------|---------|-------------------|
| `ChatSlowModeEvent` | `chatId: string`, `seconds: number`, `userId: string` | При изменении slow mode |
| `ChatMemberBannedEvent` | `chatId: string`, `targetUserId: string`, `bannedByUserId: string`, `duration?: number`, `reason?: string` | При блокировке участника |
| `ChatMemberUnbannedEvent` | `chatId: string`, `targetUserId: string`, `unbannedByUserId: string` | При разблокировке участника |

---

## Socket-интеграция

### Входящие события (клиент -> сервер)

Обрабатываются в `ChatHandler`:

| Событие | Payload | Описание |
|---------|---------|----------|
| `chat:join` | `{ chatId: string }` | Подключение к комнате чата (с проверкой членства через `ChatMemberRepository.findMembership`). При успехе -- `socket.join("chat_{chatId}")` |
| `chat:leave` | `{ chatId: string }` | Отключение от комнаты чата (`socket.leave("chat_{chatId}")`) |
| `chat:typing` | `{ chatId: string }` | Уведомление о наборе текста -- broadcast в комнату `chat_{chatId}` |

### Исходящие события (сервер -> клиент)

#### ChatListener

| Доменное событие | Socket-событие | Получатели | Payload |
|------------------|---------------|------------|---------|
| `ChatCreatedEvent` | `chat:created` | Каждому участнику (toUser) | `ChatDto` |
| `ChatUpdatedEvent` | `chat:updated` | Комната `chat_{chatId}` (toRoom) | `ChatDto` |
| `ChatMemberJoinedEvent` | `chat:member:joined` | Каждому участнику (toUser) | `{ chatId, userId }` |
| `ChatMemberLeftEvent` | `chat:member:left` | Каждому участнику (toUser) | `{ chatId, userId }` |
| `ChatPinnedEvent` | `chat:pinned` | Конкретному пользователю (toUser) | `{ chatId, isPinned }` |
| `ChatArchivedEvent` | `chat:archived` | Конкретному пользователю (toUser) | `{ chatId, isArchived }` |
| `ChatMemberRoleChangedEvent` | `chat:member:role-changed` | Комната `chat_{chatId}` (toRoom) | `{ chatId, userId, role }` |

#### ChatModerationListener

| Доменное событие | Socket-событие | Получатели | Payload |
|------------------|---------------|------------|---------|
| `ChatSlowModeEvent` | `chat:slow-mode` | Комната `chat_{chatId}` (toRoom) | `{ chatId, seconds }` |
| `ChatMemberBannedEvent` | `chat:member:banned` | Комната `chat_{chatId}` (toRoom) | `{ chatId, userId, bannedBy, reason }` |
| `ChatMemberUnbannedEvent` | `chat:member:unbanned` | Комната `chat_{chatId}` (toRoom) | `{ chatId, userId }` |

Комнаты Socket.IO формируются по шаблону `chat_{chatId}`.

---

## Валидация (Zod-схемы)

| Схема | Поля |
|-------|------|
| `CreateDirectChatSchema` | `targetUserId: uuid` |
| `CreateGroupChatSchema` | `name: string(1-100)`, `memberIds: uuid[] (min 1)`, `avatarId?: uuid` |
| `CreateChannelSchema` | `name: string(1-100)`, `description?: string(max 500)`, `username?: regex(3-50, [a-zA-Z0-9_])`, `avatarId?: uuid`, `isPublic: boolean(default false)` |
| `CreateSecretChatSchema` | `targetUserId: uuid` |
| `UpdateChatSchema` | `name?: string(1-100)`, `avatarId?: uuid \| null` |
| `UpdateChannelSchema` | `name?: string(1-100)`, `description?: string(max 500) \| null`, `username?: regex \| null`, `avatarId?: uuid \| null`, `isPublic?: boolean` |
| `AddMembersSchema` | `memberIds: uuid[] (min 1)` |
| `UpdateMemberRoleSchema` | `role: EChatMemberRole` |
| `MuteChatSchema` | `mutedUntil: datetime \| null` |
| `CreateInviteSchema` | `expiresAt?: datetime`, `maxUses?: int (positive)` |
| `CreateFolderSchema` | `name: string(1-50)` |
| `MoveChatToFolderSchema` | `folderId: uuid \| null` |
| `SetSlowModeSchema` | `seconds: int(0-86400)` |
| `BanMemberSchema` | `duration?: int(min 0)`, `reason?: string(max 500)` |

---

## Регистрация модулей

### ChatModule

```typescript
@Module({
  providers: [
    ChatRepository,
    ChatMemberRepository,
    ChatInviteRepository,
    ChatFolderRepository,
    ChatService,
    ChatController,
    asSocketHandler(ChatHandler),
    asSocketListener(ChatListener),
  ],
})
export class ChatModule {}
```

### ChatModerationModule

```typescript
@Module({
  providers: [
    ChatModerationService,
    ChatModerationController,
    asSocketListener(ChatModerationListener),
  ],
})
export class ChatModerationModule {}
```

Модуль модерации использует `ChatRepository` и `ChatMemberRepository` из основного `ChatModule`, но не импортирует его явно -- эти репозитории доступны через `@InjectableRepository`, который автоматически биндится через `toDynamicValue`.

---

## Зависимости

### Внешние модули и entity

| Модуль | Что используется | Зачем |
|--------|-----------------|-------|
| **User** | `User` entity | Связи: `createdBy` в Chat, `user` в ChatMember, ChatFolder, ChatInvite |
| **File** | `File` entity | Связь: `avatar` в Chat. URL аватара маппится в `ChatDto.avatarUrl` |
| **Profile** | `PublicProfileDto` | Используется в `ChatMemberDto` для отображения профиля участника |
| **Socket** | `ISocketHandler`, `ISocketEventListener`, `SocketEmitterService`, `TSocket`, `asSocketHandler`, `asSocketListener` | Realtime-интеграция через Socket.IO |
| **Core** | `EventBus`, `Injectable`, `InjectableRepository`, `ValidateBody`, `getContextUser`, `BaseRepository`, `BaseDto`, `IListResponseDto`, `Module` | DI, события, валидация, аутентификация |

### Кто использует этот модуль

- **Message модуль** -- использует `ChatService.canSendMessage()`, `ChatService.isMember()`, `ChatService.getMemberUserIds()`, `ChatRepository`, `ChatMemberRepository` для проверки прав и обновления `lastMessageAt`

---

## Взаимодействие с другими модулями

```
 +--------------+     ChatService API     +--------------+
 |   Message    | ----------------------> |    Chat      |
 |   Module     |  canSendMessage()       |   Module     |
 |              |  isMember()             |              |
 |              |  getMemberUserIds()     |              |
 +--------------+                         +--------------+
                                                |
                                   EventBus.emit()
                                                v
                                          +--------------+   toRoom() / toUser()
                                          |    Chat      | ---------------------->
                                          |   Listener   |
                                          +--------------+
                                                ^                +--------------+
                                                |                |   Socket     |
                                          +--------------+       |   Module     |
                                          |    Chat      |       +--------------+
                                          |   Handler    |
                                          +--------------+
                                           socket.on("chat:join")
                                           socket.on("chat:leave")
                                           socket.on("chat:typing")

 +--------------+  File entity relation   +--------------+
 |    Chat      | ----------------------> |    File      |
 |   Entity     |  avatar                 |   Module     |
 +--------------+                         +--------------+

 +--------------+  User entity relation   +--------------+
 |  Chat /      | ----------------------> |    User      |
 |  Member /    |                         |   Module     |
 |  Invite      |                         +--------------+
 +--------------+
```
