---
name: Feature Modules Reference
description: Все модули проекта — entities, services, endpoints, DTOs, events, validation schemas. Полный справочник для быстрого ориентирования
type: project
---

## Структура каждого модуля

```
src/modules/feature/
├── feature.entity.ts          # TypeORM @Entity
├── feature.repository.ts      # @InjectableRepository(Entity), extends BaseRepository
├── feature.service.ts         # @Injectable, бизнес-логика
├── feature.controller.ts      # @Injectable, tsoa @Route/@Get/@Post
├── feature.dto.ts             # DTOs с static fromEntity()
├── feature.module.ts          # @Module declaration
├── validation/                # Zod schemas для @ValidateBody
└── events/                    # Domain events (optional)
```

---

## Auth Module (`src/modules/auth/`)

**Нет entity** — использует User через UserService.

**Endpoints (все публичные + throttle):**
- `POST /api/auth/sign-up` — ThrottleGuard(5, 60s), ValidateBody(SignUpSchema)
- `POST /api/auth/sign-in` — ThrottleGuard(10, 60s), ValidateBody(SignInSchema)
- `POST /api/auth/request-reset-password` — ThrottleGuard(3, 300s)
- `POST /api/auth/reset-password` — ValidateBody(ResetPasswordSchema)
- `POST /api/auth/refresh` — ValidateBody(RefreshSchema)

**Validation:**
- SignUpSchema: password (6-100), email (optional) OR phone (optional, +7/8 format), firstName/lastName optional
- SignInSchema: login (1-100), password (6-100)
- ResetPasswordSchema: token (min 1), password (6-100)
- RefreshSchema: refreshToken (min 1)

**AuthService:** signUp (bcrypt hash, create user, issue tokens), signIn (find by email/phone, verify password), requestResetPassword (create JWT reset token, send email), resetPassword (verify token, update password), updateTokens (verify refresh, re-issue)

---

## User Module (`src/modules/user/`)

**Entity User:** id, email (unique w/ phone), emailVerified, phone, passwordHash (bcrypt), challenge (WebAuthn), challengeExpiresAt, createdAt, updatedAt
- Relations: roles (ManyToMany eager), directPermissions (ManyToMany eager), profile (OneToOne cascade eager), biometrics/otps/passkeys/resetPasswordTokens (OneToMany cascade)

**Endpoints:**
- `GET /api/user/my` — @Security("jwt")
- `PATCH /api/user/my/update` — @Security("jwt")
- `DELETE /api/user/my/delete` — @Security("jwt")
- `GET /api/user/all` — permission:user:view, query: offset, limit, query
- `GET /api/user/options` — permission:user:view
- `GET /api/user/{id}` — permission:user:view
- `PATCH /api/user/setPrivileges/{id}` — permission:user:manage, ValidateBody
- `POST /api/user/requestVerifyEmail` — @Security("jwt")
- `GET /api/user/verifyEmail/{code}` — @Security("jwt")
- `PATCH /api/user/update/{id}` — permission:user:manage
- `POST /api/user/changePassword` — @Security("jwt"), ValidateBody
- `DELETE /api/user/delete/{id}` — permission:user:manage

**Validation:**
- ChangePasswordSchema: password (6-100)
- UserUpdateSchema: email (optional, lowercase), phone (optional, normalize +7), roleId (uuid optional). Min 1 field
- SetPrivilegesSchema: roles (ERole[] min 1), permissions (EPermissions[] default [])

**AdminBootstrap:** seed admin user + default role permissions при старте.

**Repository custom:** findByEmail, findByPhone, findByEmailOrPhone, findOptions (dropdown id+name)

---

## Profile Module (`src/modules/profile/`)

**Entity Profile:** id, userId (unique, CASCADE), firstName, lastName, birthDate, gender, status (online/offline), lastOnline
- Relations: user (OneToOne), avatar (ManyToOne → File, SET NULL)

**Endpoints:**
- `GET /api/profile/my` — @Security("jwt")
- `PATCH /api/profile/my/update` — @Security("jwt")
- `DELETE /api/profile/my/delete` — @Security("jwt")
- `GET /api/profile/all` — role:admin
- `GET /api/profile/{userId}` — @Security("jwt")
- `PATCH /api/profile/update/{userId}` — role:admin
- `DELETE /api/profile/delete/{userId}` — role:admin

**Socket integration:**
- `ProfileHandler` (ISocketHandler) — слушает "profile:subscribe", добавляет в room "profile"
- `ProfileListener` (ISocketEventListener) — подписывается на ProfileUpdatedEvent → emit "profile:updated" в room
- `ProfileUpdatedEvent`: содержит PublicProfileDto

**DTOs:** ProfileDto (full), PublicProfileDto (id, firstName, lastName, status, lastOnline)

---

## Role Module (`src/modules/role/`)

**Entity Role:** id, name (ERole enum, unique), permissions (ManyToMany eager → Permission)

**Endpoints:**
- `GET /api/roles` — permission:user:manage
- `PATCH /api/roles/{id}/permissions` — role:admin, ValidateBody(SetRolePermissionsSchema)

**RoleService:** getRoles(), setRolePermissions(roleId, perms[]), seedDefaultPermissions()

---

## Permission Module (`src/modules/permission/`)

**Entity Permission:** id, name (EPermissions enum, unique), roles (ManyToMany ← Role)

**EPermissions enum:**
- `ALL = "*"` — superadmin
- `USER_VIEW = "user:view"`, `USER_MANAGE = "user:manage"`
- `CONTACT_VIEW = "contact:view"`, `CONTACT_MANAGE = "contact:manage"`, `CONTACT_ALL = "contact:*"`
- `CHAT_VIEW = "chat:view"`, `CHAT_MANAGE = "chat:manage"`, `CHAT_ALL = "chat:*"`
- `MESSAGE_VIEW = "message:view"`, `MESSAGE_MANAGE = "message:manage"`, `MESSAGE_ALL = "message:*"`
- `PUSH_MANAGE = "push:manage"`

**Нет контроллера** — управление через RoleController и UserController.setPrivileges.

---

## OTP Module (`src/modules/otp/`)

**Entity Otp:** userId (PK), code (6 цифр), expireAt. Methods: isExpired(), createOtp(userId, code, minutes)

**OtpService:** create(userId) → generate 6-digit code, upsert; check(userId, code) → verify + delete

Используется UserService для email verification.

---

## Biometric Module (`src/modules/biometric/`)

**Entity Biometric:** id, userId, deviceId (unique with userId), publicKey (text), deviceName, challenge (nullable), challengeExpiresAt (nullable), lastUsedAt, createdAt, updatedAt

**Endpoints (все @Security("jwt")):**
- `POST /api/biometric/register` — регистрация ключа (upsert по userId+deviceId, макс 5 устройств)
- `POST /api/biometric/generate-nonce` — генерация challenge (32 bytes random, TTL 5 мин), сохраняется в Biometric entity
- `POST /api/biometric/verify-signature` — верификация crypto signature → tokens
- `GET /api/biometric/devices` — список зарегистрированных устройств
- `DELETE /api/biometric/{deviceId}` — удалить устройство

**BiometricService:** Node.js crypto.createVerify SHA256, PEM key conversion, challenge хранится в Biometric entity (не в User).

---

## Passkeys Module (`src/modules/passkeys/`)

**Entity Passkey:** id (credential ID), publicKey (bytea/Uint8Array), userId, counter, deviceType, transports, lastUsed

**Endpoints:**
- `POST /api/passkeys/generate-registration-options` — @Security("jwt")
- `POST /api/passkeys/verify-registration` — @Security("jwt")
- `POST /api/passkeys/generate-authentication-options` — публичный
- `POST /api/passkeys/verify-authentication` — публичный

**PasskeysService:** @simplewebauthn/server, challenge хранится в user.challenge. Config из auth.webAuthn (rpName, rpHost, rpSchema, rpPort).

---

## File Module (`src/modules/file/`)

**Entity File:** id, name, type (MIME), url, size. Relation: avatarProfiles (OneToMany ← Profile)

**Endpoints:**
- `GET /api/file` — @Security("jwt"), query: id
- `POST /api/file` — @Security("jwt"), multipart upload
- `DELETE /api/file/{id}` — @Security("jwt"), удаляет из DB и filesystem

**FileService:** uploadFile(files[]) → save to DB; deleteFile(id) → delete from DB + fs at config.server.filesFolderPath

---

## Contact Module (`src/modules/contact/`)

**Entity Contact:** id, userId, contactUserId, displayName (varchar 80, nullable), status (EContactStatus enum), createdAt, updatedAt
- Indexes: unique(userId, contactUserId), (contactUserId, userId)
- Relations: user (ManyToOne → User, CASCADE), contactUser (ManyToOne → User, CASCADE)

**EContactStatus:** `PENDING`, `ACCEPTED`, `BLOCKED`

**Endpoints (все @Security("jwt")):**
- `POST /api/contact` — добавить контакт, ValidateBody(CreateContactSchema)
- `GET /api/contact` — список контактов, query: status (optional filter)
- `PATCH /api/contact/{id}/accept` — принять запрос
- `DELETE /api/contact/{id}` — удалить контакт (обе стороны)
- `POST /api/contact/{id}/block` — заблокировать контакт

**ContactService:** Двусторонняя модель: при addContact создаётся 2 записи — инициатор (ACCEPTED) + получатель (PENDING). acceptContact меняет статус. removeContact удаляет обе стороны. blockContact меняет статус на BLOCKED.

**Events:** ContactRequestEvent (→ contact:request), ContactAcceptedEvent (→ contact:accepted)

**Socket:** ContactListener — подписывается на ContactRequestEvent и ContactAcceptedEvent, emit в user room.

**Validation:**
- CreateContactSchema: contactUserId (uuid), displayName (max 80, optional)

---

## Chat Module (`src/modules/chat/`)

**Entity Chat:** id, type (EChatType), name (varchar 100, nullable), avatarId (nullable → File), createdById (→ User), lastMessageAt (nullable), createdAt, updatedAt
- Relations: avatar (ManyToOne → File, SET NULL), createdBy (ManyToOne → User, SET NULL), members (OneToMany → ChatMember, cascade)
- Index: lastMessageAt

**Entity ChatMember:** id, chatId, userId, role (EChatMemberRole), joinedAt, mutedUntil (nullable), lastReadMessageId (nullable)
- Indexes: unique(chatId, userId), (userId)
- Relations: chat (ManyToOne → Chat, CASCADE), user (ManyToOne → User, CASCADE)

**EChatType:** `DIRECT`, `GROUP`
**EChatMemberRole:** `OWNER`, `ADMIN`, `MEMBER`

**Endpoints (все @Security("jwt")):**
- `POST /api/chat/direct` — создать/получить личный чат, ValidateBody(CreateDirectChatSchema)
- `POST /api/chat/group` — создать групповой чат, ValidateBody(CreateGroupChatSchema)
- `GET /api/chat` — список чатов текущего пользователя, query: offset, limit
- `GET /api/chat/{id}` — получить чат по ID
- `PATCH /api/chat/{id}` — обновить групповой чат (название, аватар), ValidateBody(UpdateChatSchema)
- `DELETE /api/chat/{id}` — покинуть чат
- `POST /api/chat/{id}/members` — добавить участников, ValidateBody(AddMembersSchema)
- `DELETE /api/chat/{id}/members/{userId}` — удалить участника
- `PATCH /api/chat/{id}/members/{userId}` — изменить роль участника, ValidateBody(UpdateMemberRoleSchema)

**ChatService:**
- createDirectChat: проверка на дубликат, создаёт chat + 2 member записи
- createGroupChat: создатель = OWNER, остальные = MEMBER
- updateChat: только GROUP, только ADMIN/OWNER
- leaveChat: OWNER не может уйти пока есть другие участники (должен передать права)
- addMembers/removeMember: только ADMIN/OWNER, нельзя удалить OWNER
- updateMemberRole: только OWNER
- isMember, getMemberUserIds — helper методы для MessageService

**Events:** ChatCreatedEvent, ChatUpdatedEvent, ChatMemberJoinedEvent, ChatMemberLeftEvent

**Socket:**
- ChatHandler (ISocketHandler) — слушает "chat:join" (join room `chat:{chatId}`), "chat:leave", "chat:typing" (emit typing в room)
- ChatListener (ISocketEventListener) — подписывается на ChatCreatedEvent, ChatUpdatedEvent, ChatMemberJoinedEvent, ChatMemberLeftEvent → emit в user rooms

**Validation:**
- CreateDirectChatSchema: targetUserId (uuid)
- CreateGroupChatSchema: name (1-100), memberIds (uuid[] min 1), avatarId (uuid, optional)
- UpdateChatSchema: name (1-100, optional), avatarId (uuid, nullable, optional)
- AddMembersSchema: memberIds (uuid[] min 1)
- UpdateMemberRoleSchema: role (EChatMemberRole)

---

## Message Module (`src/modules/message/`)

**Entity Message:** id, chatId (→ Chat), senderId (→ User), type (EMessageType), content (text, nullable), replyToId (→ Message, nullable), forwardedFromId (→ Message, nullable), isEdited (boolean), isDeleted (boolean), createdAt, updatedAt
- Relations: chat (ManyToOne → Chat, CASCADE), sender (ManyToOne → User, SET NULL), replyTo/forwardedFrom (ManyToOne → Message, SET NULL), attachments (OneToMany → MessageAttachment, cascade, eager)
- Indexes: (chatId, createdAt), (senderId)

**Entity MessageAttachment:** id, messageId, fileId, createdAt
- Relations: message (ManyToOne → Message, CASCADE), file (ManyToOne → File, CASCADE, eager)
- Index: (messageId)

**EMessageType:** `TEXT`, `IMAGE`, `FILE`, `VOICE`, `SYSTEM`

**Endpoints (все @Security("jwt")):**

ChatMessageController (@Route("api/chat")):
- `POST /api/chat/{chatId}/message` — отправить сообщение, ValidateBody(SendMessageSchema)
- `GET /api/chat/{chatId}/message` — список сообщений (cursor-based), query: before, limit
- `POST /api/chat/{chatId}/message/read` — отметить прочитанным, ValidateBody(MarkReadSchema)

MessageController (@Route("api/message")):
- `PATCH /api/message/{id}` — редактировать сообщение, ValidateBody(EditMessageSchema)
- `DELETE /api/message/{id}` — удалить сообщение (soft delete)

**MessageService:**
- sendMessage: проверка membership, создание в транзакции (message + attachments + updateLastMessageAt)
- getMessages: cursor-based пагинация (before messageId), default limit 50
- editMessage: только автор, isEdited=true
- deleteMessage: автор или ADMIN/OWNER чата, soft delete (isDeleted=true, content=null)
- markAsRead: обновляет lastReadMessageId в ChatMember
- getUnreadCount: подсчёт непрочитанных по lastReadMessageId

**Events:** MessageCreatedEvent (chatId, memberUserIds), MessageUpdatedEvent (chatId), MessageDeletedEvent (messageId, chatId), MessageReadEvent (chatId, userId, messageId)

**Socket:**
- MessageHandler (ISocketHandler) — слушает "message:read" → вызывает markAsRead
- MessageListener (ISocketEventListener) — подписывается на все message events → emit в chat room и user rooms

**Validation:**
- SendMessageSchema: type (EMessageType, default TEXT), content (max 4000, optional), replyToId (uuid, optional), forwardedFromId (uuid, optional), fileIds (uuid[] max 10, optional). Refine: content или fileIds обязателен
- EditMessageSchema: content (1-4000)
- MarkReadSchema: messageId (uuid)

---

## Push Module (`src/modules/push/`)

**Entity DeviceToken:** id, userId, token (varchar 512, unique), platform (EDevicePlatform), deviceName (varchar 100, nullable), createdAt, updatedAt
- Relations: user (ManyToOne → User, CASCADE)
- Indexes: (userId), unique(token)

**Entity NotificationSettings:** id, userId (unique), muteAll (boolean, default false), soundEnabled (boolean, default true), showPreview (boolean, default true)
- Relations: user (OneToOne → User, CASCADE)
- Index: unique(userId)

**EDevicePlatform:** `IOS`, `ANDROID`, `WEB`

**Endpoints (все @Security("jwt")):**

DeviceController (@Route("api/device")):
- `POST /api/device` — зарегистрировать устройство, ValidateBody(RegisterDeviceSchema)
- `DELETE /api/device/{token}` — удалить устройство

NotificationSettingsController (@Route("api/notification")):
- `GET /api/notification/settings` — получить настройки уведомлений
- `PATCH /api/notification/settings` — обновить настройки, ValidateBody(UpdateNotificationSettingsSchema)

**PushService:** Firebase Admin SDK (FCM). Инициализация из config.firebase.serviceAccountPath. sendToUser/sendToUsers — проверяет muteAll, отправляет multicast, удаляет невалидные токены. Graceful degradation — если Firebase не настроен, push отключён.

**DeviceTokenService:** registerToken (upsert по token), unregisterToken, getTokensForUser.

**NotificationSettingsService:** getSettings (auto-create default), updateSettings (upsert).

**Socket:** PushListener — подписывается на MessageCreatedEvent → push уведомление участникам чата (кроме отправителя).

**Validation:**
- RegisterDeviceSchema: token (1-512), platform (EDevicePlatform), deviceName (max 100, optional)
- UpdateNotificationSettingsSchema: muteAll (boolean, optional), soundEnabled (boolean, optional), showPreview (boolean, optional)

---

## Mailer Module (`src/modules/mailer/`)

**Нет entity/controller.** Nodemailer с Gmail SMTP.

**MailerService:** sendCodeMail(email, code) — EJS template; sendResetPasswordMail(email, token) — EJS template с URL из config.

---

## Reset-Password-Tokens Module (`src/modules/reset-password-tokens/`)

**Entity ResetPasswordTokens:** userId (PK), token (JWT, unique index)

**Service:** create(userId) → JWT с expiry из config, upsert; check(token) → verify JWT + find in DB + delete.

---

## Socket Module (`src/modules/socket/`)

**Нет entity.** Инфраструктурный модуль.

**Сервисы:**
- `SocketServerService` — обёртка над Socket.IO Server
- `SocketAuthMiddleware` — JWT из handshake.auth.token → TokenService.verify()
- `SocketClientRegistry` — Map<userId, Set<socket>>, isOnline(userId)
- `SocketEmitterService` — toUser(userId, event, args), toRoom(room, event, args), broadcast(event, args)

**Socket Types:**

Client → Server (ISocketEvents):
- `"profile:subscribe"` — подписка на обновления профиля
- `"chat:join"` — присоединиться к комнате чата `{ chatId }`
- `"chat:leave"` — покинуть комнату чата `{ chatId }`
- `"chat:typing"` — индикатор набора текста `{ chatId }`
- `"message:read"` — отметить сообщения прочитанными `{ chatId, messageId }`

Server → Client (ISocketEmitEvents):
- `"authenticated"` — успешная аутентификация
- `"auth_error"` — ошибка аутентификации
- `"profile:updated"` — обновление профиля (PublicProfileDto)
- `"message:new"` — новое сообщение
- `"message:updated"` — сообщение отредактировано
- `"message:deleted"` — сообщение удалено `{ messageId, chatId }`
- `"chat:created"` — новый чат
- `"chat:updated"` — чат обновлён
- `"chat:typing"` — кто-то набирает текст `{ chatId, userId }`
- `"chat:unread"` — обновление непрочитанных `{ chatId, unreadCount }`
- `"chat:member:joined"` — участник добавлен
- `"chat:member:left"` — участник удалён
- `"contact:request"` — запрос на добавление в контакты
- `"contact:accepted"` — контакт принят

**SocketBootstrap:** auth middleware → on("connection") → register socket + join user room → call all ISocketHandler.onConnection() → on("disconnect") → unregister. Затем register all ISocketEventListener.

**Interfaces для расширения:**
- `ISocketHandler` / `SOCKET_HANDLER` — входящие события (onConnection)
- `ISocketEventListener` / `SOCKET_EVENT_LISTENER` — EventBus → socket emit (register)
- Helpers: `asSocketHandler(cls)`, `asSocketListener(cls)` для удобной регистрации в @Module
