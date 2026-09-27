# Модуль Chat

Личные чаты, группы и каналы: участники с ролями, invite-ссылки, папки, модерация
(slow mode, персистентный бан) и real-time уведомления через Socket.IO.

---

## Структура файлов

```
src/modules/chat/
├── chat.entity.ts                  # Chat (chats)
├── chat-member.entity.ts           # ChatMember (chat_members)
├── chat-invite.entity.ts           # ChatInvite (chat_invites)
├── chat-folder.entity.ts           # ChatFolder (chat_folders)
├── chat-ban.entity.ts              # ChatBan (chat_bans)
├── chat.types.ts                   # EChatType, EChatMemberRole
├── chat.errors.ts                  # ChatError: доменные коды CHAT_*
├── chat.repository.ts              # + buildDirectKey, escapeLikePattern
├── chat-member.repository.ts       # + CHAT_MEMBERS_PREVIEW_LIMIT
├── chat-invite.repository.ts
├── chat-folder.repository.ts
├── chat-ban.repository.ts
├── chat.service.ts                 # чаты, участники, роли, инвайты, папки
├── chat-moderation.service.ts      # slow mode, бан
├── chat.controller.ts
├── chat-moderation.controller.ts
├── chat.handler.ts                 # socket: join/leave/typing (onValidated + лимиты)
├── chat.seed.bootstrap.ts          # демо-чаты и сообщения (development)
├── chat.listener.ts                # EventBus → socket, комнаты, UserDeletedEvent
├── chat-moderation.listener.ts
├── chat.module.ts / chat-moderation.module.ts
├── dto/  events/  validation/
└── *.test.ts
```

---

## Entities

### Chat (`chats`)

| Поле              | Тип                      | Описание                                                           |
| ----------------- | ------------------------ | ------------------------------------------------------------------ |
| `id`              | `uuid` PK                |                                                                    |
| `type`            | `EChatType`              | `direct`, `group`, `channel`                                       |
| `directKey`       | `varchar(73)`, nullable  | Ключ пары `min(a,b):max(a,b)` для direct, `null` для групп/каналов |
| `name`            | `varchar(100)`, nullable |                                                                    |
| `description`     | `varchar(500)`, nullable | Для каналов                                                        |
| `username`        | `varchar(50)`, nullable  | Для каналов                                                        |
| `isPublic`        | `boolean`                | Публичный канал                                                    |
| `avatarId`        | `uuid`, nullable         | FK → File, SET NULL                                                |
| `createdById`     | `uuid`, nullable         | FK → User, SET NULL                                                |
| `slowModeSeconds` | `int`                    |                                                                    |
| `lastMessage*`    |                          | Денормализованное последнее сообщение                              |

Индексы: `IDX_CHATS_USERNAME` (unique, `username IS NOT NULL`),
`IDX_CHATS_DIRECT_KEY` (unique, `direct_key IS NOT NULL`) — не допускает дублей direct-чата
одной пары.

### ChatMember (`chat_members`)

| Поле                                                                                         | Тип                     | Описание                                                                  |
| -------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `chatId`, `userId`                                                                           | `uuid`                  | FK CASCADE; unique `(chatId, userId)`                                     |
| `role`                                                                                       | `EChatMemberRole`       |                                                                           |
| `joinedAt`                                                                                   | `timestamptz`           |                                                                           |
| `mutedUntil`, `lastReadMessageId`, `unreadCount`, `isPinnedChat`, `pinnedChatAt`, `folderId` |                         | Личные настройки — отдаются только владельцу членства (`ChatDto.me`)      |
| `hiddenAt`                                                                                   | `timestamptz`, nullable | Direct-чат скрыт пользователем («выход»); новое сообщение снимает скрытие |

### ChatBan (`chat_bans`)

| Поле                       | Тип                      | Описание                                      |
| -------------------------- | ------------------------ | --------------------------------------------- |
| `chatId`, `userId`         | `uuid`                   | FK CASCADE; unique `(chatId, userId)`         |
| `bannedById` (`banned_by`) | `uuid`, nullable         | FK → User, SET NULL                           |
| `reason`                   | `varchar(500)`, nullable |                                               |
| `until`                    | `timestamptz`, nullable  | `null` — бессрочно; истёкший бан не действует |
| `createdAt`                | `timestamptz`            |                                               |

### ChatInvite (`chat_invites`), ChatFolder (`chat_folders`)

Invite: `code` (unique), `expiresAt`, `maxUses`, `useCount`, `isActive`.
Folder: `name` (`varchar(50)`, unique на пользователя), `position`.

---

## Роли и правила

| Роль         | Где            | Права                                                                          |
| ------------ | -------------- | ------------------------------------------------------------------------------ |
| `owner`      | группа, канал  | всё; единственный, кто меняет роли, передаёт владение и удаляет чат            |
| `admin`      | группа, канал  | редактирование, инвайты, добавление; удаление/бан только `member`/`subscriber` |
| `member`     | группа, direct |                                                                                |
| `subscriber` | канал          | только чтение                                                                  |

- `updateMemberRole`: только владелец; не себя; не `owner` (для этого — передача владения);
  группа — `admin`/`member`, канал — `admin`/`subscriber`.
- Передача владения — транзакция: старый владелец → `admin`, новый → `owner`.
- Владелец не может уйти/отписаться, пока есть другие участники (409). Единственный
  участник-владелец при выходе удаляет чат.
- Выход из direct — скрытие (`hiddenAt`), членство и история остаются. Повторный
  `POST /direct` или новое сообщение (`ChatMemberRepository.unhideForChat`) возвращают чат.
- Direct-чат создаётся через `INSERT … ON CONFLICT DO NOTHING` по `direct_key`; при гонке
  возвращается уже созданный чат.
- Блокировки (`UserBlockService.isBlockedEither` из модуля contact) запрещают создание
  direct-чата, добавление в группу и создание группы с заблокированным (403).
- Все добавляемые пользователи должны существовать (400); вставка членств —
  `ON CONFLICT DO NOTHING`.
- Бан: запись в `chat_bans` + удаление членства (одна транзакция). Забаненный не может
  вступить по инвайту, подписаться или быть добавленным (403). Разбан только удаляет
  запись — в чат пользователь не возвращается.
- Инвайт: `expiresAt` в прошлом → 400; использование расходуется атомарным
  `UPDATE … SET use_count = use_count + 1 WHERE … use_count < max_uses` с проверкой
  `affected` в одной транзакции со вставкой членства. В канал по инвайту — `subscriber`.
- Поиск каналов: `q` минимум 2 символа, `%`/`_`/`\` экранируются.
- Папок у пользователя — не больше `MAX_CHAT_FOLDERS` (20), поэтому список папок
  отдаётся целиком; сверх лимита — 409 `CHAT_FOLDER_LIMIT`.
- Все списки — `IPaginatedDto<T>` (`offset` по умолчанию 0, `limit` 20, максимум 100).
- Ссылки на файлы (аватар чата, аватары участников в `members`/`me`/`peer`) подписываются
  пачкой через `FileUrlService` (`collectChatFiles` / `collectChatMemberFiles` +
  `toDtoMap`/`buildWithFiles`) до сборки DTO — в ответах, событиях сокета и payload sync.
- Удаление пользователя (`UserDeletedEvent`): группы/каналы, где он владелец, передаются
  старейшему `admin`, иначе старейшему участнику; без других участников — удаляются.
  Затем зачищаются чаты без участников и без владельца (событие может прийти до или после
  каскадного удаления). Direct-чаты остаются.

---

## Ошибки (`chat.errors.ts`, коды `CHAT_*`)

`NOT_FOUND` 404, `NOT_MEMBER` 403, `ADMIN_REQUIRED` 403, `OWNER_REQUIRED` 403,
`BANNED` 403 (сам в бане), `USER_BANNED` 403 (добавляемый в бане), `USER_BLOCKED` 403,
`USER_NOT_FOUND` 400, `SELF_CHAT` 400, `DIRECT_NOT_SUPPORTED` 400 (операция не для
личного чата), `NOT_GROUP` 400, `NOT_CHANNEL` 400, `CHANNEL_PRIVATE` 403,
`NOT_SUBSCRIBED` 400, `USERNAME_TAKEN` 409, `MEMBER_NOT_FOUND` 404, `SELF_REMOVE` 400,
`CANNOT_MODERATE` 403, `SELF_ROLE_CHANGE` 400, `OWNER_ROLE_VIA_TRANSFER` 400,
`ROLE_NOT_ALLOWED` 400, `OWNER_ROLE_IMMUTABLE` 403, `ALREADY_OWNER` 400,
`OWNER_MUST_TRANSFER` 409, `SEARCH_QUERY_TOO_SHORT` 400, `INVITE_NOT_FOUND` 404,
`INVITE_EXPIRED` 400, `INVITE_EXHAUSTED` 400, `INVITE_INVALID_EXPIRY` 400,
`FOLDER_NOT_FOUND` 404, `FOLDER_NAME_TAKEN` 409, `FOLDER_LIMIT` 409, `SELF_BAN` 403,
`NOT_BANNED` 404. Модули message и poll бросают `CHAT_NOT_FOUND`/`CHAT_NOT_MEMBER`
для чата сообщения.

---

## Endpoints (`api/v1/chat`, `@Security("jwt")`)

| Метод         | Путь                                | Ответ                                | Описание                                                  |
| ------------- | ----------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| POST          | `/direct`                           | 201 `ChatDto`                        | Создать/получить личный чат                               |
| POST          | `/group`                            | 201 `ChatDto`                        | Создать группу                                            |
| POST          | `/channel`                          | 201 `ChatDto`                        | Создать канал                                             |
| PATCH         | `/channel/{id}`                     | `ChatDto`                            | Обновить канал                                            |
| POST          | `/channel/{id}/subscribe`           | `ChatDto`                            | Подписаться на публичный канал                            |
| DELETE        | `/channel/{id}/subscribe`           | 204                                  | Отписаться                                                |
| GET           | `/channel/search?q=&offset=&limit=` | `IPaginatedDto<ChatDto>`             | Поиск публичных каналов                                   |
| GET           | `/?offset=&limit=`                  | `IPaginatedDto<ChatDto>`             | Мои чаты (без скрытых direct)                             |
| GET           | `/{id}`                             | `ChatDto`                            | Чат                                                       |
| PATCH         | `/{id}`                             | `ChatDto`                            | Обновить группу/канал                                     |
| POST          | `/{id}/leave`                       | 204                                  | Покинуть чат (direct — скрыть)                            |
| DELETE        | `/{id}`                             | 204                                  | Удалить группу/канал (владелец)                           |
| POST          | `/{id}/transfer-ownership`          | 204                                  | Передать владение (`{ userId }`)                          |
| GET           | `/{id}/members?offset=&limit=`      | `IPaginatedDto<ChatMemberPublicDto>` | Участники постранично                                     |
| POST          | `/{id}/members`                     | `ChatMemberPublicDto[]`              | Добавить участников в группу (ответ — только добавленные) |
| DELETE        | `/{id}/members/{userId}`            | 204                                  | Удалить участника                                         |
| PATCH         | `/{id}/members/{userId}`            | `ChatMemberPublicDto`                | Сменить роль                                              |
| POST          | `/{id}/invite`                      | 201 `ChatInviteDto`                  | Создать инвайт                                            |
| GET           | `/{id}/invite?offset=&limit=`       | `IPaginatedDto<ChatInviteDto>`       | Активные инвайты                                          |
| DELETE        | `/{id}/invite/{inviteId}`           | 204                                  | Отозвать инвайт                                           |
| POST          | `/join/{code}`                      | `ChatDto`                            | Вступить по инвайту                                       |
| PATCH         | `/{id}/mute`                        | `ChatMemberDto`                      | Мут                                                       |
| POST / DELETE | `/{id}/pin`                         | `ChatMemberDto`                      | Закрепить / открепить                                     |
| PATCH         | `/{id}/folder`                      | `ChatMemberDto`                      | Переместить в папку                                       |
| GET           | `/folder/list`                      | `ChatFolderDto[]`                    | Папки (целиком, не больше 20)                             |
| POST          | `/folder`                           | 201 `ChatFolderDto`                  | Создать папку (дубликат имени — 409)                      |
| PATCH         | `/folder/{folderId}`                | `ChatFolderDto`                      | Обновить папку (`UpdateFolderSchema`, дубликат — 409)     |
| DELETE        | `/folder/{folderId}`                | 204                                  | Удалить папку                                             |

Модерация (`ChatModerationController`, admin/owner):

| Метод  | Путь                                  | Ответ                             | Описание                                    |
| ------ | ------------------------------------- | --------------------------------- | ------------------------------------------- |
| PATCH  | `/{id}/slow-mode`                     | `{ chatId, slowModeSeconds }`     | Slow mode                                   |
| POST   | `/{id}/members/{userId}/ban`          | 204                               | Бан (`duration` сек., без него — бессрочно) |
| DELETE | `/{id}/members/{userId}/ban`          | 204                               | Снять бан (нет бана — 404)                  |
| GET    | `/{id}/members/banned?offset=&limit=` | `IPaginatedDto<IBannedMemberDto>` | Действующие баны                            |

Все path-параметры-идентификаторы — `UUID` (неверный формат → 422).

---

## DTO

- `ChatDto` — поля чата, `members: ChatMemberPublicDto[]` (для групп/каналов — первые
  `CHAT_MEMBERS_PREVIEW_LIMIT`), `membersCount`, `me: ChatMemberDto | null` (своё членство
  с личными настройками), `peer` (собеседник direct-чата).
- `ChatMemberPublicDto` — `id`, `userId`, `role`, `joinedAt`, `profile`.
- `ChatMemberDto extends ChatMemberPublicDto` — + `mutedUntil`, `lastReadMessageId`,
  `isPinnedChat`, `pinnedChatAt`, `folderId`. Отдаётся только самому участнику.
- `ChatDto.fromEntity(chat, files, currentUserId?, extra?)`: `files` — карта подписей
  (`TSignedFiles`), `avatarUrl` и `profile.avatarUrl` участников берутся только из неё
  (нет в карте — `null`). Участники из `extra` (превью, `me`) передаются в
  `collectChatFiles(chats, members)`.
- `ChatMemberPublicDto` / `ChatMemberDto` / `ChatPeerDto` — `fromEntity(member, files)`;
  `profile` — `PublicProfileDto` с `avatarUrl`. Сборка с подписью —
  `ChatService.toMemberPublicDtos` / `toMemberDto`.
- `IBannedMemberDto` — `chatId`, `userId`, `bannedBy`, `reason`, `bannedAt`, `expiresAt`.

---

## События (EventBus)

| Событие                                                                 | Когда                                                                                                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChatCreatedEvent(chat, memberUserIds)`                                 | создан чат                                                                                                                                                                       |
| `ChatUpdatedEvent(chat)`                                                | обновлён чат/канал                                                                                                                                                               |
| `ChatDeletedEvent(chatId, memberUserIds, deletedBy)`                    | чат удалён (владельцем, последним участником, при удалении пользователя)                                                                                                         |
| `ChatMemberJoinedEvent(chatId, userId, memberUserIds, member?)`         | добавление, подписка, инвайт                                                                                                                                                     |
| `ChatMemberLeftEvent(chatId, userId, memberUserIds)`                    | выход, удаление, отписка, бан                                                                                                                                                    |
| `ChatMemberRoleChangedEvent(chatId, userId, role, changedBy)`           | смена роли, передача владения                                                                                                                                                    |
| `ChatPinnedEvent`, `ChatLastMessageUpdatedEvent`                        |                                                                                                                                                                                  |
| `ChatMutedEvent(chatId, userId, mutedUntil)`                            | мут/размут чата (личная настройка)                                                                                                                                               |
| `ChatFolderChangedEvent(userId, folderId, change, folder)`              | папка создана/изменена/удалена (`change`: `created`/`updated`/`deleted`, `folder` — `ChatFolderDto`, для `deleted` — `null`; чаты удалённой папки отдельных событий не получают) |
| `ChatMovedToFolderEvent(chatId, userId, folderId)`                      | чат перемещён в папку (`folderId: null` — убран из папки)                                                                                                                        |
| `ChatSlowModeEvent`, `ChatMemberBannedEvent`, `ChatMemberUnbannedEvent` | модерация                                                                                                                                                                        |

Слушает: `UserDeletedEvent` (модуль user) → `ChatService.handleUserDeleted`.

---

## Socket

Входящие (`ChatHandler`) регистрируются через `onValidated` модуля socket: Zod-схемы
(`validation/chat-socket.validate.ts`), лимит частоты на сокет, ack
`{ ok: false, error: { code, message } }` при ошибке.

| Событие              | Схема / лимит                        | Поведение                                                        |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `chat:join`          | `{ chatId: uuid }`, 10/с (запас 20)  | вход в `chat_{id}` при членстве, иначе `CHAT_NOT_MEMBER`         |
| `chat:leave`         | `{ chatId: uuid }`, 10/с (запас 20)  | выход из `chat_{id}`                                             |
| `typing:subscribe`   | `{ chatIds: uuid[] ≤ 200 }`, 2/с (5) | вход в `typing_{id}` только для чатов, где пользователь участник |
| `typing:unsubscribe` | `{ chatIds: uuid[] ≤ 200 }`, 2/с (5) | выход из `typing_{id}`                                           |
| `chat:typing`        | `{ chatId: uuid }`, 2/с              | рассылка только участнику; не участнику — молча                  |

Комнаты (`ChatListener`, через `SocketEmitterService.joinRoom/leaveRoom` для всех сокетов
пользователя): создание чата и вступление → вход в `chat_{id}`/`typing_{id}`; выход,
удаление, бан, удаление чата → выход из обеих комнат.

Исходящие: `chat:created`, `chat:updated`, `chat:member:joined`, `chat:member:left`
(также каждому участнику при удалении чата), `chat:pinned`, `chat:member:role-changed`,
`chat:last-message`, `chat:slow-mode`, `chat:member:banned` (в комнату и лично
забаненному), `chat:member:unbanned`.

---

## Bootstrappers

`ChatSeedBootstrap` (`critical = false`, только development): личные чаты
администратора (`ADMIN_EMAIL`) с alice и bob и группа «Проект: Мессенджер» на четверых
с перепиской. Пользователей alice/bob/charlie (`*@test.local`) создаёт сид модуля user —
здесь они ищутся по email; нет пользователя — его чат пропускается. Чат с сообщениями
повторно не наполняется. Сообщения идут через `MessageService.sendMessage` (импорт по
файлу, не через barrel message — без цикла загрузки).

---

## Зависимости

- **contact** — `UserBlockService.isBlockedEither`.
- **user** — `User` entity (связи, проверка существования), `UserDeletedEvent`.
- **file** — `FileUrlService` (подпись ссылок), `File` entity; **profile** — `PublicProfileDto`.
- **message** — только сид (`MessageService`, `EMessageType`).
- **socket** — handler/listener, `SocketEmitterService`.
- Используют модуль: message (`ChatService.isMember/canSendMessage/getMemberUserIds`,
  `ChatMemberRepository.unhideForChat`), poll, sync, push, bot, profile, socket.
