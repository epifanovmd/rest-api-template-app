---
name: project_example
description: Ветка example/messenger — main + модули мессенджера (chat, message, contact, call, poll, sync, push, bot); здесь их точки подключения к платформе, сокет-события, очереди, бизнес-правила и gotcha
type: project
---

# example/messenger — модули мессенджера поверх платформы

`main` — только базовая платформа. Ветка `example/messenger` = main + модули `contact`, `chat`
(вместе с chat-moderation), `message`, `poll`, `call`, `bot`, `push`, `sync`. Это бэкенд фронтенда
`/Users/epifanovmd/dev/react-vite`. Подробности каждого модуля — `src/modules/<name>/README.md`.

## Правила ведения ветки

- Общие исправления делаются в `main`, в ветку попадают через merge `main` → `example/messenger`.
  В самой ветке меняется только код модулей мессенджера (и точки их регистрации).
- Миграции: базовая `src/migrations/1790353961289-InitialSchema.ts` из main **никогда не перегенерируется**;
  ветка добавляет свою миграцию поверх (таблицы мессенджера) и регистрирует её в `src/migrations/index.ts`.
- CI (`.github/workflows/ci.yml`) запускается только для `main`; в ветке-примере не запускается.
- Модули базы (`src/core`, `modules/{user,profile,file,socket,session,...}`) не импортируют модули
  мессенджера — связь только через точки расширения ниже.

## Регистрация (`src/app.module.ts`)

Порядок: база main (Core → Observability → Storage → Jobs → Mailer/Otp/ResetPasswordTokens → User/Profile/
File/Auth/Session/ApiKey/Audit/Biometric/Passkeys) → блок «Модули проекта»: **Contact, Chat, ChatModeration,
Message, Poll, Call, Bot, Push, Sync** → **SocketModule последним** (multi-inject handlers/listeners/rooms).
В снимке порядок был другим (Workspace среди базы, Session между Push и Sync) — в ветке брать порядок main.
Импорты в снимке: `BotModule`/`CallModule`/`PollModule`/`SyncModule` — глубоким путём до `*.module.ts`,
`ChatModerationModule` — `./modules/chat/chat-moderation.module`, остальные — через `index.ts`.

| Модуль          | Entities (таблицы)                                                                                                       | Провайдеры-расширения                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contact         | Contact (`contacts`)                                                                                                     | `asSocketListener(ContactListener)`, `asContactRelation(ContactRelation)`, `asPresenceAudience(ContactPresenceAudience)`; `UserBlockService`                                             |
| chat            | Chat, ChatMember, ChatInvite, ChatFolder, ChatBan (`chats`, `chat_members`, `chat_invites`, `chat_folders`, `chat_bans`) | `asSocketRoomProvider(ChatRoomProvider)`, `asSocketHandler(ChatHandler)`, `asSocketListener(ChatListener)`, `asPresenceAudience(ChatPresenceAudience)`, bootstrapper `ChatSeedBootstrap` |
| chat-moderation | — (сущности chat)                                                                                                        | `ChatModerationService`, `ChatModerationController`, `asSocketListener(ChatModerationListener)`                                                                                          |
| message         | Message, MessageAttachment, MessageDeletion, MessageReaction, MessageReceipt, MessageMention (`messages`, `message_*`)   | `asSocketHandler(MessageHandler)`, `asSocketListener(MessageListener)`, `{ provide: FILE_USAGE_PROBE, useClass: MessageFileUsageProbe }`                                                 |
| poll            | Poll, PollOption, PollVote (`polls`, `poll_options`, `poll_votes`)                                                       | `PollController`, `PollChatController`, `asSocketListener(PollListener)`                                                                                                                 |
| call            | Call (`calls`)                                                                                                           | `asSocketHandler(CallHandler)`, `asSocketListener(CallListener)`, `asJobHandler` ×2 (ringing)                                                                                            |
| bot             | Bot, BotCommand, WebhookLog (`bots`, `bot_commands`, `webhook_logs`)                                                     | `asSecurityScheme(BotSecurityScheme)`, `asSocketListener(BotListener)`, `asJobHandler(BotWebhookJob)`, `asJobHandler(BotWebhookLogsCleanupJob)`                                          |
| push            | DeviceToken, NotificationSettings (`device_tokens`, `notification_settings`)                                             | `asSocketListener(PushListener)`, `asJobHandler(PushSendJob)`, `pushConfig`                                                                                                              |
| sync            | SyncLog, SyncState (`sync_logs`, `sync_state`)                                                                           | `asSocketListener(SyncListener)`, `asJobHandler(SyncCleanupJob)`, `asJobHandler(SyncCompactionJob)`                                                                                      |

Зависимости между модулями: chat → contact (`UserBlockService`); message → chat, contact, poll, file;
poll → message (`sendMessage` с `onCreated`); call → chat (`findDirectChat`), contact; sync/push/bot →
chat, message; push → socket (`SocketClientRegistry.isOnline`).

## Точки расширения main, которые использует ветка

### Профиль: связи (`src/modules/profile/profile.relations.ts`)

Токены `CONTACT_RELATION` / `PRESENCE_AUDIENCE`, хелперы `asContactRelation(Cls)` / `asPresenceAudience(Cls)`.
Потребители (все `@multiInject … @optional()`): `PrivacySettingsService` (`canSeeField`/`getVisibleUserIds`),
`PresenceListener` (`user:online`/`user:offline`), `PresenceHandler` (`presence:init` при подключении).

| Провайдер                                                 | `audience(userId, level)` / `contactsOf`                                                                          | `peers(userId)`          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `ContactRelation` (`contact/contact.relations.ts`)        | `contactsOf(viewer, userIds)` — те из `userIds`, у кого `viewer` в ACCEPTED-контактах (уровень `contacts`)        | —                        |
| `ContactPresenceAudience` (там же)                        | `nobody` → []; `contacts` → кого пользователь принял; `everyone` → ещё и те, у кого он сам в контактах (обратные) | `[]`                     |
| `ChatPresenceAudience` (`chat/chat.presence-audience.ts`) | кроме `nobody` — собеседники direct-чатов (`ChatMemberRepository.findDirectChatPartnerIds`)                       | собеседники direct-чатов |

Gotcha: в чистом main провайдеров нет — уровень приватности `contacts` открывает поле только самому
пользователю, `user:online/offline` не уходят никому, `presence:init` не отправляется (пустой список).
При `showLastOnline = nobody` рассылки нет независимо от провайдеров.

### Сокет-события (`<feature>.socket-events.ts`)

Каждый модуль дополняет `ISocketEvents` (клиент → сервер) / `ISocketEmitEvents` (сервер → клиент) через
`declare module "../socket/socket.types"` — **именно файл-объявление, не `../socket` (index)**, иначе
augmentation не срабатывает. Файл экспортируется из `index.ts` модуля (payload-интерфейсы `ISocket*Payload`).

| Файл                               | Клиент → сервер                                                                                                | Сервер → клиент                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat/chat.socket-events.ts`       | `chat:join`, `chat:leave`, `chat:typing` `{ chatId }`; `typing:subscribe`/`typing:unsubscribe` `{ chatIds }`   | `chat:created`, `chat:updated` (ChatDto), `chat:deleted {chatId}`, `chat:typing {chatId,userId}`, `chat:unread {chatId,unreadCount}`, `chat:member:joined {chatId,userId,member?}`, `chat:member:left`, `chat:pinned {chatId,isPinned}`, `chat:member:role-changed`, `chat:last-message {chatId,lastMessage}`, `chat:slow-mode {chatId,seconds}`, `chat:member:banned {…,bannedBy,reason?}`, `chat:member:unbanned` |
| `message/message.socket-events.ts` | `message:read {chatId,messageIds}` (+ устар. `messageId`), `message:delivered {chatId,messageIds}` — оба с ack | `message:new`, `message:updated`, `message:pinned` (MessageDto), `message:deleted`/`message:unpinned {messageId,chatId}`, `message:reaction {…,userId,emoji                                                                                                                                                                                                                                                         | null}`, `message:status {messageId,chatId,status,userId?,receiptSummary?}` |
| `contact/contact.socket-events.ts` | —                                                                                                              | `contact:request`, `contact:accepted`, `contact:blocked`, `contact:unblocked` (ContactDto), `contact:removed {contactId}`                                                                                                                                                                                                                                                                                           |
| `call/call.socket-events.ts`       | `call:offer`/`call:answer {callId,sdp}`, `call:ice-candidate {callId,candidate}`, `call:hangup {callId}`       | `call:incoming`, `call:answered`, `call:declined`, `call:missed` (CallDto), `call:ended` (CallDto \| `{callId,endedBy}`), relay `call:offer`/`call:answer {callId,fromUserId,sdp}`, `call:ice-candidate {callId,fromUserId,candidate}`                                                                                                                                                                              |
| `poll/poll.socket-events.ts`       | —                                                                                                              | `poll:voted`, `poll:closed` (PollDto)                                                                                                                                                                                                                                                                                                                                                                               |
| `sync/sync.socket-events.ts`       | —                                                                                                              | `sync:available {version}`                                                                                                                                                                                                                                                                                                                                                                                          |
| `push/push.socket-events.ts`       | —                                                                                                              | `push:settings-changed` (NotificationSettingsDto)                                                                                                                                                                                                                                                                                                                                                                   |
| `bot/bot.socket-events.ts`         | —                                                                                                              | `bot:webhook-disabled {botId,failureCount,lastError}` (владельцу)                                                                                                                                                                                                                                                                                                                                                   |

Handlers: `ChatHandler`, `MessageHandler`, `CallHandler` — все через `onValidated(socket, event, Zod, handler,
{ rateLimit })`. Лимиты token bucket: `CHAT_SOCKET_LIMITS` (room 10/с burst 20, typingRooms 2/с burst 5,
typing 2/с), `MESSAGE_SOCKET_LIMITS.receipts` 10/с, `CALL_SOCKET_LIMITS` (signal 5/с burst 10, ice 50/с
burst 100). Размеры: `MAX_TYPING_ROOMS` 200, `MAX_RECEIPT_BATCH` 200, `MAX_SDP_BYTES` 64 КБ,
`MAX_ICE_CANDIDATE_BYTES` 4 КБ. `chat:join`/`chat:typing` — проверка членства (комната уже есть или
`findMembership`). Эталон handler-а — `chat/chat.handler.ts`.

Комнаты: `ChatRoomProvider` (`chat/chat.room-provider.ts`) при подключении добавляет `chat_<id>` и
`typing_<id>` всех чатов пользователя; вступление/выход/бан/удаление — `joinRoom`/`leaveRoom`.

### Права (`definePermissions`, экспорт из `index.ts`)

Сигнатура main — `definePermissions(domain, { key, label }, { KEY: { name, label } })` (группа и подписи для
каталога `GET /api/v1/permissions`). `chat/chat.permissions.ts` — группа «Чаты»: `chat:view`, `chat:manage`, `chat:*`;
`contact/contact.permissions.ts` — «Контакты»: `contact:view|manage|*`; `message/message.permissions.ts` —
«Сообщения»: `message:view|manage|*`; `push/push.permissions.ts` — «Push-уведомления»: `push:manage`. Только
регистрируются в реестре (по умолчанию — у admin через `*`), ни один контроллер их в `@Security` не использует;
при появлении проверок — разбить `manage` на действия (как `SplitManagePermissions` в main).

Файлы — права main с областью «все / свои» (`file:view|delete` + `:own`, у `user`/`guest` по умолчанию `:own`):
чужой файл (даже вложение общего чата) через `/api/v1/file/{id}` невидим — 404, не 403. Кандидаты на `OwnedAccess`
(ручная проверка владельца): `BotService.getBotById` (`bot.ownerId !== ownerId` → `BOT_ACCESS_DENIED`, без
суперпользователя), `ContactService` (`contact.userId !== userId` → 404). Правка/удаление сообщения автором
(`message.senderId`) и участие в звонке — доменные правила, не области прав.

### Конфиг модуля (`push/push.config.ts`)

`defineModuleConfig("push", …)`: `serviceAccountPath` из `FIREBASE_SERVICE_ACCOUNT_PATH`, резолвится
`resolveFromRoot` от корня проекта; пусто — push выключен (задачи не ставятся); в production `refine` —
файл обязан существовать. `PushService` читает `pushConfig`, firebase-admin 14 — модульный API
(`firebase-admin/app` `cert`/`initializeApp`, `firebase-admin/messaging`). Зависимость `firebase-admin ^14`
в `package.json`. `firebaseAccount.json` игнорируется ещё в main (`.gitignore`/`.dockerignore`); `FIREBASE_SERVICE_ACCOUNT_PATH` — в `.env.example` и `harness.ts` e2e, `FIREBASE_SERVICE_ACCOUNT_PATH: ""`); в Docker ключ монтируется томом
(`docker-compose.yml`, закомментированный пример `/app/secrets/firebase.json:ro`).
Gotcha: README push пишет `config.firebase.serviceAccountPath` — устарело, в коде `pushConfig`.

### Прочее

- Схема аутентификации `bot` — `bot/bot.scheme.ts` (`BotSecurityScheme`, `asSecurityScheme`): токен из
  `Authorization: Bot <token>` или `X-Bot-Token` (длина ≤ 256), `BotService.findByToken`, неактивный/неизвестный —
  `BOT_INVALID_TOKEN` 401, нет токена — `BOT_TOKEN_REQUIRED`; контекст `kind: "bot"`, `userId = bot.userId`.
  В `tsoa.json → securityDefinitions` запись `bot` (apiKey, header `X-Bot-Token`) — в ветке должна быть.
- `FILE_USAGE_PROBE` — `MessageFileUsageProbe` (`message-file-usage.probe.ts`): файл во вложениях
  (`MessageAttachmentRepository.existsForFile`) удалить нельзя (409).
- Шаблонов писем (augmentation `IMailTemplateData`) у модулей мессенджера нет.
- `ChatSeedBootstrap` (`chat.seed.bootstrap.ts`) — только `isDevelopment`: direct admin↔alice, admin↔bob и группа
  «Проект: Мессенджер»; пользователей alice/bob/charlie (`*@test.local`) создаёт сид user; идемпотентен
  (есть сообщения — пропуск).

## Очереди задач

| Очередь                    | Модуль | Тип                                                                                                                         |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `push.send`                | push   | служебная, `retryLimit` 3; частичный сбой FCM — новая задача `{ deliveries, retry }`, 30 с·2^retry, до `PUSH_MAX_RETRIES` 5 |
| `bot.webhook`              | bot    | служебная, 6 попыток (`retryLimit` 5), задержка 5 с экспоненциально, `JobError(code, msg, retryable)`                       |
| `call.ringing-timeout`     | call   | отложенная `startAfter = ringingTimeoutAt`, `singletonKey call:<id>`, ставится в транзакции звонка (outbox), `retryLimit` 3 |
| `call.ringing-sweep`       | call   | cron `* * * * *` — страховка (`expireRingingCalls`)                                                                         |
| `sync.compaction`          | sync   | cron `15 */6 * * *`                                                                                                         |
| `sync.cleanup`             | sync   | cron `30 3 * * *`, retention 90 дней + watermark                                                                            |
| `bot.webhook-logs-cleanup` | bot    | cron `45 3 * * *`, журнал старше 30 дней                                                                                    |

Выполняются на `APP_ROLE=worker|all`; события до клиентов — через Redis-адаптер сокетов.

## Эндпоинты по тегам (все `/api/v1`, итого 89)

Chat 29, Message 15, Bot 15, Contact 6, Call 6, Poll 5, Push 4 (`/device`, `/notification/settings`),
Chat Moderation 4, Bot API 3 (`/bot-api/message`, `@Security("bot")`), Sync 2. Остальное — `@Security("jwt")`.

## Enum-ы

```
EChatType:         direct | group | channel
EChatMemberRole:   owner | admin | member | subscriber
EMessageType:      text | image | file | voice | system | poll   (клиент не шлёт system/poll — CLIENT_MESSAGE_TYPES)
EMessageStatus:    sent | delivered | read
EAttachmentStatus: processing | ready | failed
EContactStatus:    pending | accepted | blocked
ECallType:         voice | video
ECallStatus:       ringing | active | ended | missed | declined
EDevicePlatform:   ios | android | web
ESyncEntityType:   message | chat | chat_member | contact | profile | message_pin | poll | chat_pin | chat_folder | chat_folder_item | chat_mute
ESyncAction:       create | update | delete
WEBHOOK_EVENT_TYPES: message, command, message_edited/deleted/reaction/pinned/unpinned, member_joined/left/role_changed/banned/unbanned, chat_created/updated, poll_created/voted/closed, call_initiated/ended
```

## Бизнес-правила (ключевое)

- **Контакты/блокировки**: добавление создаёт двустороннюю связь; блокировка — строка `contacts` со статусом
  BLOCKED у блокирующего; `UserBlockService.isBlockedEither` проверяется в direct-чате, группах, сообщениях
  DIRECT, звонках, контактах. `POST/DELETE /contact/block/{userId}`. Разблокировка удаляет строку.
- **Чаты**: `chats.direct_key` unique — `ChatRepository.insertDirectChat` через `INSERT … ON CONFLICT DO NOTHING`
  - перечитывание; выход из direct = `chat_members.hiddenAt` (новое сообщение — `unhideForChat`). Роли
    owner/admin/member/subscriber; владелец уходит только после передачи владения (409 `CHAT_OWNER_MUST_TRANSFER`);
    `DELETE /chat/{id}` — владелец (`chat:deleted`). Бан — `chat_bans` с `until` + удаление членства; разбан не
    возвращает в чат. Инвайт — атомарный `use_count < max_uses`. Папок ≤ `MAX_CHAT_FOLDERS` (20).
    `ChatDto`: `members` (превью `CHAT_MEMBERS_PREVIEW_LIMIT` = 5) + `membersCount` + `me` + `peer`; полный список —
    `GET /chat/{id}/members`. Удаление пользователя: владение → старейший admin/участник, пустые чаты удаляются.
- **Сообщения**: лента — `IMessagePageDto { items, nextCursor, prevCursor }`, keyset `(createdAt, id)`
  (`findOlder/findNewer/findAround`), `around` отдельно (с `cursor` — 400), `limit` 50/макс 100, битый курсор —
  `MESSAGE_INVALID_CURSOR`. IDOR-проверки `replyToId`/`forwardedFromId`/`fileIds` (файл свой, не `pending`, строки
  `FOR UPDATE`); канал — пишут ADMIN/OWNER; slow mode → 429 + `Retry-After`. Unread — `GREATEST(0, …)`.
  Receipts — batch `INSERT … ON CONFLICT` только вперёд. Удаление «для всех» — soft delete (условный
  `markDeleted`, `isDeleted = true`, повтор — `MESSAGE_ALREADY_DELETED`), «для себя» — `message_deletions`.
- **Закрепление** (`_findMessageForPin`): нужно членство (иначе `CHAT_NOT_MEMBER`); в не-direct чатах —
  только ADMIN/OWNER (`MESSAGE_PIN_FORBIDDEN`); удалённое — нельзя.
- **Опросы**: создаются как сообщение (`sendMessage` + `onCreated`); голос/отзыв/чтение — участник; закрыть —
  автор или ADMIN/OWNER; удаление сообщения «для всех» закрывает опрос.
- **Звонки**: `chatId` клиент не передаёт (direct-чат пары ищется сам); в транзакции
  `pg_advisory_xact_lock(CALL_LOCK_NAMESPACE, hashtext(userId))` на обоих участников в отсортированном порядке;
  занято — `CALL_BUSY`/`CALL_ALREADY_IN_CALL` 409; RINGING 60 с (`CALL_RINGING_TIMEOUT_MS`); переходы —
  `CallRepository.transitionStatus` (условный `UPDATE … WHERE status IN (…)` + `affected`, проигравший — 409).
  Сигналинг: адресат — вторая сторона звонка из БД, `targetUserId` клиента игнорируется.
- **Боты**: у бота технический `User` (`bot.userId`), в чат добавляется явно (`POST /bot/{id}/chats/{chatId}`);
  bot-API и вебхуки — только в чатах, где бот участник. Вебхук: подпись `X-Bot-Signature` (HMAC-SHA256),
  `X-Bot-Event/Delivery/Attempt`, таймаут 10 с, SSRF-защита (приватные адреса блокируются, IP закрепляется);
  после `WEBHOOK_FAILURE_THRESHOLD` (10) подряд проваленных доставок — отключение + `bot:webhook-disabled`.
- **Push**: только offline-пользователям (`SocketClientRegistry`), учитывает mute чата, `muteAll`,
  `showPreview` (`hiddenPreview`), `soundEnabled`; @-упоминание обходит mute; невалидные токены удаляются;
  токен привязан к сессии (`device_tokens.session_id` CASCADE, `SessionTerminatedEvent` чистит).
- **Sync**: журнал `sync_logs` (user- или scope-записи, scope = чат), write-time compaction по `entityKey`
  (user-scoped ключ с `@userId`), `requiresSnapshot` при `sinceVersion` ниже watermark (`sync_state`) или выше
  текущей; потеря доступа к чату — user-scoped `CHAT delete`. Payload DTO с подписанными ссылками (живут
  `STORAGE_SIGNED_URL_TTL_SECONDS`).
- Ссылки на файлы в DTO — только `FileUrlService` (`buildWithFiles`/`buildOneWithFiles`/`toDtoMap` +
  `collectChatFiles`, `collectChatMemberFiles`, `collectCallFiles`, `collectContactFiles`, …); DTO
  `fromEntity(entity, files)` с обязательной картой. Отдельного `signFiles`/`chat/signed-files.ts` нет
  (старая память ошибалась; `signed-files.ts` — в модуле file).
- Ошибки — `defineErrors`: `CHAT_*`, `CONTACT_*`, `MESSAGE_*`, `POLL_*`, `CALL_*`, `BOT_*`, `PUSH_*`, `SYNC_*`;
  «не участник чата» везде `CHAT_NOT_MEMBER`. Списки — `IPaginatedDto`.

## Эталоны из модулей мессенджера

- `contact/` — в снимке «эталонный модуль» (entity с индексами/каскадами, сервис с транзакцией + событие после,
  контроллер, DTO `fromEntity`, Zod-схема, listener → `toUser`). В main эталон должен браться из базы.
- Handler — `chat/chat.handler.ts`; room provider — `chat/chat.room-provider.ts`; схема — `bot/bot.scheme.ts`;
  служебная очередь с `JobError` — `bot/bot-webhook.job.ts`; отложенная задача + cron-страховка —
  `call/call-ringing.job.ts`; `pg_advisory_xact_lock` — `call.service.ts::initiateCall`; `ON CONFLICT` +
  перечитывание — `ChatRepository.insertDirectChat`; атомарный переход — `CallRepository.transitionStatus`;
  soft delete — `message.service.ts::deleteMessage`; keyset-лента — `message.repository.ts`.

## E2E

- `test/e2e/messenger.e2e.ts`, `describe("мессенджер")`: «контакты и блокировки», «чаты» (direct без дублей,
  группа/membersCount/me, роли, инвайты, бан, личное: mute/pin/папки), «сообщения» (сокет, защита, курсор/поиск,
  правка/реакции/закрепление/прочтение, удаление для всех, slow mode 429, вложения/медиа), «опросы», «звонки»,
  «каналы, владение, удаление» (подписчик не пишет, передача владения, скрытый direct), «sync».
- Из `test/e2e/platform.e2e.ts` снимка к ветке относятся блоки «боты» (жизненный цикл бота и bot-API) и тест
  «push-устройство: только владелец удаляет; настройки уведомлений» (в describe «устройства, уведомления,
  биометрия, passkeys»).

## Env

Только `FIREBASE_SERVICE_ACCOUNT_PATH` (секция «Push (Firebase)» в `.env.example`, пусто — push выкл.;
`docker-compose.yml` пробрасывает `${FIREBASE_SERVICE_ACCOUNT_PATH:-}`). У bot/call/sync своих переменных нет —
лимиты константами в `*.types.ts`/сервисах.

## Gotcha

- `declare module` в `*.socket-events.ts` — только `"../socket/socket.types"`; через index не работает.
- У `sync` нет `index.ts` — импорт по файлам; `bot/index.ts` не экспортирует контроллеры/схему.
- chat ↔ message: сид чатов импортирует message по файлам, не через barrel (иначе цикл загрузки).
- README push («`config.firebase`») расходится с кодом (`pushConfig`); README chat/poll пишут «неверный UUID → 422»
  — устарело: `UUID` в path отклоняет tsoa, error middleware отдаёт 400 `VALIDATION_ERROR` (как в main).
- Zod 4 `z.string().uuid()` не принимает `00000000-…-0001` — в тестах сокет-схем v4-подобные id.

## Пробы использования файлов

`MessageFileUsageProbe` (вложения), `ChatAvatarUsageProbe`, `BotAvatarUsageProbe` — пакетные `filesInUse(ids)`,
регистрация `asFileUsageProbe`. Без них `file.gc` удалил бы аватары и вложения удалённого пользователя.
