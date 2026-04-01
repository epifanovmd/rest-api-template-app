# REST API Messenger — Полная документация

## Обзор

Полнофункциональный backend мессенджера на Node.js/TypeScript. Модульный монолит с IoC (inversify), TypeORM (PostgreSQL), Koa (HTTP), Socket.IO (WebSocket), event-driven архитектурой.

**Статистика:** 132 REST endpoints, 63 socket events, 31 entity, 21 модуль, ~886 тестов.

---

## Стек технологий

| Компонент | Технология |
|-----------|-----------|
| Runtime | Node.js (TypeScript) |
| HTTP | Koa + tsoa (REST, Swagger) |
| IoC/DI | inversify |
| Database | PostgreSQL + TypeORM |
| Real-time | Socket.IO |
| Auth | JWT, bcrypt, WebAuthn (@simplewebauthn), biometric |
| Push | Firebase Admin SDK (FCM) |
| Email | Nodemailer + EJS templates |
| Images | sharp (thumbnails) |
| Validation | Zod |
| Logging | pino |
| Security | helmet, CORS, rate limiting |
| Tests | Mocha + Chai + Sinon |

---

## Bootstrap Flow

`src/main.ts` → `new App().start(AppModule)` → `src/app.ts`:

1. **initializeDatabase()** — TypeORM connection (3 retry, 2s delay)
2. **registerCoreBindings()** — Controller, DataSource, Koa, HttpServer
3. **loadModules()** — ModuleLoader обходит дерево @Module, регистрирует providers/bootstrappers
4. **configureMiddleware()** — 8 middleware в порядке: requestId → helmet → cors → bodyParser → rateLimit → requestLogger → error → notFound
5. **configureRoutes()** — tsoa routes + swagger UI + system routes (/ping, /health)
6. **runBootstrappers()** — AdminBootstrap → SocketBootstrap
7. **listen()** — HTTP server

**Порядок модулей (src/app.module.ts):**
CoreModule → MailerModule → OtpModule → ResetPasswordTokensModule → UserModule → ProfileModule → FileModule → AuthModule → BiometricModule → PasskeysModule → ContactModule → ChatModule → ChatModerationModule → MessageModule → PollModule → CallModule → BotModule → PushModule → SessionModule → SyncModule → SocketModule

---

## Модули и функционал

### 1. Auth — Аутентификация

**Endpoints (8):**
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | /api/auth/sign-up | — | Регистрация (email/phone + password) |
| POST | /api/auth/sign-in | — | Вход (login + password, поддержка 2FA) |
| POST | /api/auth/verify-2fa | — | Верификация cloud password |
| POST | /api/auth/enable-2fa | jwt | Включить 2FA |
| POST | /api/auth/disable-2fa | jwt | Отключить 2FA |
| POST | /api/auth/request-reset-password | — | Запрос сброса пароля |
| POST | /api/auth/reset-password | — | Сброс пароля по токену |
| POST | /api/auth/refresh | — | Обновление JWT токенов |

**2FA flow:** signIn → если twoFactorHash есть → вернуть `{ require2FA: true, twoFactorToken, hint }` → клиент отправляет verify-2fa → получает токены.

**Rate limits:** sign-up 5/60s, sign-in 10/60s, reset-password 3/300s.

### 2. User — Пользователи

**Entity User:** id, email, phone, username, passwordHash, emailVerified, twoFactorHash, twoFactorHint, challenge, challengeExpiresAt → roles(M2M), directPermissions(M2M), profile(O2O), biometrics/passkeys/otps(O2M)

**Endpoints (15):**
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | /api/user/my | jwt | Текущий пользователь |
| PATCH | /api/user/my/update | jwt | Обновить email/phone |
| PATCH | /api/user/my/username | jwt | Установить @username (5-32, a-z0-9_) |
| DELETE | /api/user/my/delete | jwt | Удалить аккаунт |
| GET | /api/user/search | jwt | Поиск по username/email/имени |
| GET | /api/user/by-username/{u} | jwt | Найти по @username |
| GET | /api/user/all | jwt+perm | Список всех (пагинация) |
| GET | /api/user/options | jwt+perm | Для dropdown (id+name) |
| GET | /api/user/{id} | jwt+perm | По ID |
| PATCH | /api/user/setPrivileges/{id} | jwt+perm | Назначить роли/права |
| POST | /api/user/requestVerifyEmail | jwt | Отправить OTP на email |
| GET | /api/user/verifyEmail/{code} | jwt | Подтвердить email |
| PATCH | /api/user/update/{id} | jwt+perm | Админ: обновить |
| POST | /api/user/changePassword | jwt | Сменить пароль |
| DELETE | /api/user/delete/{id} | jwt+perm | Админ: удалить |

**Bootstrap:** AdminBootstrap — seed admin + default role permissions при старте.

### 3. Profile — Профили

**Entity Profile:** userId(unique), firstName, lastName, birthDate, gender, status(online/offline), lastOnline, avatar(→File)

**Entity PrivacySettings:** userId(unique), showLastOnline, showPhone, showAvatar — каждый: everyone/contacts/nobody

**Endpoints (9):**
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | /api/profile/my | jwt | Мой профиль |
| PATCH | /api/profile/my/update | jwt | Обновить |
| GET | /api/profile/my/privacy | jwt | Настройки приватности |
| PATCH | /api/profile/my/privacy | jwt | Обновить приватность |
| DELETE | /api/profile/my/delete | jwt | Удалить |
| GET | /api/profile/all | jwt+admin | Все профили |
| GET | /api/profile/{userId} | jwt | Публичный профиль |
| PATCH | /api/profile/update/{userId} | jwt+admin | Админ: обновить |
| DELETE | /api/profile/delete/{userId} | jwt+admin | Админ: удалить |

**Services:** ProfileService, PresenceService (online/offline tracking), PrivacySettingsService.

**Socket:** `profile:subscribe` (client), `profile:updated`, `profile:privacy-changed`, `user:online`, `user:offline`, `presence:init` (server)

### 4. Chat — Чаты

**Entity Chat:** type(direct/group/channel), name, description, username(unique), isPublic, avatarId, createdById, slowModeSeconds, lastMessageAt, lastMessageId, lastMessageContent, lastMessageType, lastMessageSenderId

**Entity ChatMember:** chatId+userId(unique), role(owner/admin/member/subscriber), joinedAt, mutedUntil, lastReadMessageId, isPinnedChat, pinnedChatAt, isArchived, folderId

**Entity ChatInvite:** code(unique), chatId, createdById, expiresAt, maxUses, useCount, isActive

**Entity ChatFolder:** userId+name(unique), position

**Endpoints (26 ChatController + 4 Moderation = 30):**
- `POST direct/group/channel` — создание 3 типов чатов
- `GET /` — список чатов, `GET /{id}` — детали
- `PATCH /{id}` — обновить, `DELETE /{id}` — покинуть
- `PATCH channel/{id}` — обновить канал
- `POST/DELETE channel/{id}/subscribe` — подписка на канал
- `GET channel/search` — поиск публичных каналов
- `POST/GET/DELETE /{id}/invite` — invite-ссылки
- `POST join/{code}` — вступить по invite
- `PATCH /{id}/mute` — мут/unmute
- `POST/DELETE /{id}/members` — управление участниками
- `PATCH /{id}/members/{userId}` — изменить роль
- `POST/DELETE /{id}/pin` — закрепить/открепить чат
- `PATCH /{id}/folder` — переместить в папку
- `GET/POST/PATCH/DELETE folder/*` — CRUD папок

**Moderation endpoints:**
- `PATCH /{id}/slow-mode` — ограничение частоты сообщений
- `POST/DELETE /{id}/members/{userId}/ban` — бан/разбан
- `GET /{id}/members/banned` — список забаненных

**Socket events:** chat:join, chat:leave, chat:typing (client) + chat:created, chat:updated, chat:typing, chat:unread, chat:member:joined, chat:member:left, chat:pinned, chat:member:role-changed, chat:last-message, chat:slow-mode, chat:member:banned, chat:member:unbanned (server)

### 5. Message — Сообщения

**Entity Message:** chatId, senderId, type(text/image/file/voice/system/poll), content, status(sent/delivered/read), replyToId, forwardedFromId, isEdited, isDeleted, isPinned, pinnedAt, pinnedById, keyboard(jsonb)

**Entity MessageAttachment:** messageId, fileId → file(eager)
**Entity MessageReaction:** messageId+userId(unique), emoji
**Entity MessageMention:** messageId, userId(nullable), isAll

**Endpoints (14 = 7 ChatMessageController + 7 MessageController):**
- `POST /api/chat/{chatId}/message` — отправить (text/image/file/voice, attachments, mentions, reply, forward)
- `GET /api/chat/{chatId}/message` — cursor-based пагинация
- `GET /api/chat/{chatId}/message/search` — поиск в чате
- `GET /api/chat/{chatId}/message/pinned` — закреплённые
- `GET /api/chat/{chatId}/media` — медиа-галерея (фильтр по type)
- `GET /api/chat/{chatId}/media/stats` — статистика медиа
- `POST /api/chat/{chatId}/message/read` — отметить прочитанным
- `GET /api/message/search` — глобальный поиск
- `PATCH /api/message/{id}` — редактировать
- `DELETE /api/message/{id}` — удалить (soft)
- `POST/DELETE /api/message/{id}/pin` — закрепить/открепить
- `POST/DELETE /api/message/{id}/reaction` — реакция emoji

**Socket events:** message:read, message:delivered (client) + message:new, message:updated, message:deleted, message:reaction, message:pinned, message:unpinned, message:status (server)

### 6. Contact — Контакты

**Entity Contact:** userId+contactUserId(unique), displayName, status(pending/accepted/blocked)

**Двусторонняя модель:** addContact создаёт 2 записи — инициатор(ACCEPTED) + получатель(PENDING).

**Endpoints (5):** POST(добавить), GET(список, ?status), PATCH /{id}/accept, DELETE /{id}, POST /{id}/block

**Socket:** contact:request, contact:accepted, contact:removed, contact:blocked, contact:unblocked (server)

### 7. Call — Звонки

**Entity Call:** callerId, calleeId, chatId?, type(voice/video), status(ringing/active/ended/missed/declined), startedAt, endedAt, duration

**Endpoints (6):** POST(начать), POST /{id}/answer, POST /{id}/decline, POST /{id}/end, GET /history, GET /active

**WebRTC signaling через Socket:** call:offer, call:answer, call:ice-candidate, call:hangup (client) + call:incoming, call:answered, call:declined, call:ended, call:missed, call:offer, call:answer, call:ice-candidate (server relay)

### 8. Poll — Опросы

**Entities:** Poll(messageId, question, isAnonymous, isMultipleChoice, isClosed), PollOption(text, position), PollVote(pollId+optionId+userId unique)

**Endpoints (5):** POST /api/chat/{chatId}/poll, POST/DELETE /api/poll/{id}/vote, POST /api/poll/{id}/close, GET /api/poll/{id}

**Socket:** poll:voted, poll:closed (server)

### 9. Bot — Боты

**Entity Bot:** ownerId, username(unique), displayName, description, avatarId, token(unique 256), webhookUrl, webhookSecret, webhookEvents(jsonb), isActive

**Entity BotCommand:** botId+command(unique), description

**Entity WebhookLog:** botId, eventType, payload(jsonb), statusCode, success, errorMessage, attempts, durationMs, createdAt

**Management API (JWT, 13 endpoints):** CRUD бота + regenerate token + set/delete webhook + set/get commands + webhook test + webhook logs + webhook events

**Bot API (Bot token auth, 3 endpoints):** POST /api/bot-api/message/send, POST /api/bot-api/message/{id}/edit, DELETE /api/bot-api/message/{id}

**Auth scheme "bot":** Authorization: Bot <token> или X-Bot-Token header

**WebhookService:** HMAC-SHA256 подпись, retry 3x (1s→5s→25s), 10s timeout. WebhookLog записывает результаты.

**BotListener:** MessageCreatedEvent → парсинг /commands → webhook delivery

### 10. Biometric — Биометрия

**Entity Biometric:** userId+deviceId(unique), publicKey, deviceName, challenge, challengeExpiresAt, lastUsedAt

**Endpoints (5):** POST register, POST generate-nonce, POST verify-signature, GET devices, DELETE /{deviceId}

**Лимит:** max 5 устройств на пользователя. Challenge TTL 5 минут.

### 11. Passkeys — WebAuthn

**Entity Passkey:** id(credentialId), publicKey(Uint8Array), userId, counter, deviceType, transports, lastUsed

**Entity PasskeyChallenge:** userId, challenge, expiresAt

**Endpoints (4):** POST generate-registration-options(jwt), POST verify-registration(jwt), POST generate-authentication-options(public), POST verify-authentication(public)

**Библиотека:** @simplewebauthn/server

### 12. Session — Сессии

**Entity Session:** userId, refreshToken(unique), deviceName, deviceType, ip, userAgent, lastActiveAt

**Endpoints (3):** GET /api/session, DELETE /api/session/{id}, POST /api/session/terminate-others

**Socket:** session:new, session:terminated (server) — клиент на другом устройстве разлогинивается

### 13. Sync — Инкрементальная синхронизация

**Entity SyncLog:** version(auto-increment bigint), entityType(message/chat/chat_member/contact/profile), entityId, action(create/update/delete), userId?, chatId?, payload(jsonb)

**Endpoint (1):** GET /api/sync?sinceVersion=42&limit=100

**Listener:** подписывается на все EventBus events → автоматическая запись в SyncLog

**Socket:** sync:available (server) — уведомление клиента о новых данных

### 14. Push — Push-уведомления

**Entities:** DeviceToken(userId, token unique, platform ios/android/web, deviceName), NotificationSettings(userId unique, muteAll, soundEnabled, showPreview)

**Endpoints (4):** POST/DELETE /api/device, GET/PATCH /api/notification/settings

**PushService:** Firebase Admin SDK (FCM). Graceful degradation если Firebase не настроен.

**PushListener:** MessageCreatedEvent → push offline участникам (с учётом mute + mention bypass). ContactRequestEvent → push.

### 15. File — Файлы

**Entity File:** id, name, type(MIME), url, size, thumbnailUrl, width, height

**Endpoints (3):** GET /api/file, POST /api/file (multipart upload), DELETE /api/file/{id}

**Services:** FileService, MediaProcessorService (sharp thumbnails — resize webp для изображений).

### 16. Role & Permission — Роли и права

**Entity Role:** name → permissions(M2M eager)
**Entity Permission:** name

**Endpoints (4):** GET /api/roles, POST /api/roles, DELETE /api/roles/{id}, PATCH /api/roles/{id}/permissions

**Roles (const):** admin, user, guest — расширяемые через API.

**Permissions (const):** * (all), user:view, user:manage, role:view, role:manage, profile:view, profile:manage, contact:view/manage/*, chat:view/manage/*, message:view/manage/*, push:manage — расширяемые через API.

**Wildcard:** `chat:*` матчит `chat:view` и `chat:manage`. `*` матчит всё.

**Superadmin bypass:** роль admin или permission `*` → пропускает все проверки.

### 17. Mailer — Email

**Сервис:** Nodemailer + Gmail SMTP. EJS-шаблоны.

**Методы:** sendCodeMail(email, code), sendResetPasswordMail(email, token)

### 18. OTP — Одноразовые коды

**Entity Otp:** userId(PK), code(6 цифр), expireAt

**Используется:** UserService для email verification.

### 19. Reset Password Tokens

**Entity:** userId(PK), token(JWT, unique)

---

## Guards (защита эндпоинтов)

| Guard | Описание |
|-------|----------|
| ThrottleGuard(limit, windowMs) | Rate limiting по IP |
| RequireVerifiedEmailGuard | Требует emailVerified=true в JWT |
| ApiKeyGuard(key, header) | Проверка API-ключа в заголовке |
| RequireHttpsGuard | Только HTTPS (+ x-forwarded-proto) |
| IpWhitelistGuard(ips[]) | Только разрешённые IP |

---

## Middleware

| # | Middleware | Описание |
|---|-----------|----------|
| 1 | RequestId | UUID для каждого запроса |
| 2 | Helmet | Security headers |
| 3 | CORS | Whitelist + credentials |
| 4 | BodyParser | JSON/form parsing |
| 5 | RateLimit | 1000 req/15min по IP |
| 6 | RequestLogger | Timing + slow request warning (>2s) |
| 7 | Error | HttpException → JSON response |
| 8 | NotFound | 404 fallback |

---

## Socket.IO — Полный список событий

### Client → Server (11 событий)

| Event | Data | Описание |
|-------|------|----------|
| ping | {ts} | Application-level heartbeat |
| profile:subscribe | — | Подписка на обновления |
| chat:join | {chatId} | Войти в комнату чата |
| chat:leave | {chatId} | Покинуть комнату |
| chat:typing | {chatId} | Индикатор набора |
| message:read | {chatId, messageId} | Отметить прочитанным |
| message:delivered | {chatId, messageIds[]} | Подтвердить доставку |
| call:offer | {callId, targetUserId, sdp} | WebRTC offer |
| call:answer | {callId, targetUserId, sdp} | WebRTC answer |
| call:ice-candidate | {callId, targetUserId, candidate} | ICE candidate |
| call:hangup | {callId, targetUserId} | Завершить звонок |

### Server → Client (52 события)

| Event | Data | Описание |
|-------|------|----------|
| pong | {ts} | Ответ на heartbeat |
| authenticated | {userId} | Успешное подключение |
| auth_error | {message} | Ошибка аутентификации |
| profile:updated | PublicProfileDto | Профиль изменён |
| profile:privacy-changed | PrivacySettingsDto | Настройки приватности |
| message:new | MessageDto | Новое сообщение |
| message:updated | MessageDto | Сообщение отредактировано |
| message:deleted | {messageId, chatId} | Сообщение удалено |
| message:reaction | {messageId, chatId, userId, emoji} | Реакция |
| message:pinned | MessageDto | Сообщение закреплено |
| message:unpinned | {messageId, chatId} | Сообщение откреплено |
| message:status | {messageId, chatId, status} | Статус доставки |
| chat:created | ChatDto | Новый чат |
| chat:updated | ChatDto | Чат обновлён |
| chat:typing | {chatId, userId} | Кто-то печатает |
| chat:unread | {chatId, unreadCount} | Счётчик непрочитанных |
| chat:member:joined | {chatId, userId, member?} | Участник добавлен |
| chat:member:left | {chatId, userId} | Участник удалён |
| chat:pinned | {chatId, isPinned} | Чат закреплён |
| chat:member:role-changed | {chatId, userId, role} | Роль изменена |
| chat:last-message | {chatId, lastMessage} | Последнее сообщение |
| chat:slow-mode | {chatId, seconds} | Slow mode изменён |
| chat:member:banned | {chatId, userId, bannedBy, reason?} | Участник забанен |
| chat:member:unbanned | {chatId, userId} | Участник разбанен |
| poll:voted | PollDto | Голос записан |
| poll:closed | PollDto | Опрос закрыт |
| call:incoming | CallDto | Входящий звонок |
| call:answered | CallDto | Звонок принят |
| call:declined | CallDto | Звонок отклонён |
| call:ended | CallDto/EndedPayload | Звонок завершён |
| call:missed | CallDto | Пропущенный звонок |
| call:offer | {callId, fromUserId, sdp} | Relay SDP offer |
| call:answer | {callId, fromUserId, sdp} | Relay SDP answer |
| call:ice-candidate | {callId, fromUserId, candidate} | Relay ICE |
| user:email-verified | {verified} | Email подтверждён |
| user:password-changed | {userId, method} | Пароль изменён |
| user:privileges-changed | {roles[], permissions[]} | Привилегии изменены |
| user:username-changed | {userId, username} | Username изменён |
| user:online | {userId, lastOnline?} | Пользователь онлайн |
| user:offline | {userId, lastOnline?} | Пользователь оффлайн |
| presence:init | {onlineUserIds[]} | Начальный список онлайн |
| sync:available | {version} | Новые данные для sync |
| contact:request | ContactDto | Запрос контакта |
| contact:accepted | ContactDto | Контакт принят |
| contact:removed | {contactId} | Контакт удалён |
| contact:blocked | ContactDto | Контакт заблокирован |
| contact:unblocked | ContactDto | Контакт разблокирован |
| push:settings-changed | NotificationSettingsDto | Настройки push |
| auth:2fa-changed | {enabled} | Статус 2FA изменён |
| session:new | SessionDto | Новая сессия |
| session:terminated | {sessionId} | Сессия завершена |
| error | {event, message} | Ошибка обработки события |

---

## Enums и типы

```
EChatType:        direct | group | channel
EChatMemberRole:  owner | admin | member | subscriber
EMessageType:     text | image | file | voice | system | poll
EMessageStatus:   sent | delivered | read
EContactStatus:   pending | accepted | blocked
ECallType:        voice | video
ECallStatus:      ringing | active | ended | missed | declined
EDevicePlatform:  ios | android | web
ESyncEntityType:  message | chat | chat_member | contact | profile
ESyncAction:      create | update | delete

Roles (const):       admin | user | guest        → TRole
Permissions (const): * | user:view | user:manage | role:view | role:manage | profile:view | profile:manage | contact:view | contact:manage | contact:* | chat:view | chat:manage | chat:* | message:view | message:manage | message:* | push:manage → TPermission
```

---

## Тестирование

**~886 тестов** (Mocha + Chai + Sinon), 45 test-файлов.

| Категория | Примерное кол-во |
|-----------|-----------------|
| Security (TokenService, guards, permissions) | ~55 |
| Services (29 сервисов) | ~450 |
| EventBus | ~23 |
| Webhook | ~8 |
| Socket handlers + listeners | ~50 |
| Middleware (error) | ~20 |
| DTOs (Message, Chat, User) | ~37 |
| Validation schemas (Zod) | ~243 |

---

## Конфигурация (env)

```env
SERVER_PORT=8080
SERVER_HOST=0.0.0.0
SERVER_PUBLIC_HOST=http://localhost:8080
SERVER_FILES_FOLDER_PATH=./uploads
SERVER_FILES_SERVER_PORT=8081

JWT_SECRET_KEY=secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin123

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=messenger
POSTGRES_POOL_MAX=10

SMTP_USER=email@gmail.com
SMTP_PASS=app-password

FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-sa.json

WEB_AUTHN_RP_NAME=Messenger
WEB_AUTHN_RP_HOST=localhost
WEB_AUTHN_RP_SCHEMA=https
WEB_AUTHN_RP_PORT=3000
```

---

## Health endpoints

- `GET /ping` — server time
- `GET /health` — uptime, DB status
- `GET /api-docs` — Swagger UI
