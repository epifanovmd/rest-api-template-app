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

**Entity User:** id, email (unique w/ phone), emailVerified, phone, passwordHash (bcrypt), challenge (WebAuthn)
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

**Нет контроллера** — управление через RoleController и UserController.setPrivileges.

---

## OTP Module (`src/modules/otp/`)

**Entity Otp:** userId (PK), code (6 цифр), expireAt. Methods: isExpired(), createOtp(userId, code, minutes)

**OtpService:** create(userId) → generate 6-digit code, upsert; check(userId, code) → verify + delete

Используется UserService для email verification.

---

## Biometric Module (`src/modules/biometric/`)

**Entity Biometric:** id, userId, deviceId (unique with userId), publicKey (text), deviceName, lastUsedAt

**Endpoints (все публичные):**
- `POST /api/biometric/register` — регистрация ключа
- `POST /api/biometric/generate-nonce` — генерация challenge (32 bytes random)
- `POST /api/biometric/verify-signature` — верификация crypto signature → tokens

**BiometricService:** Node.js crypto.createVerify SHA256, PEM key conversion, challenge-response flow.

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
- Client → Server: `"profile:subscribe"`
- Server → Client: `"authenticated"`, `"auth_error"`, `"profile:updated"`

**SocketBootstrap:** auth middleware → on("connection") → register socket + join user room → call all ISocketHandler.onConnection() → on("disconnect") → unregister. Затем register all ISocketEventListener.

**Interfaces для расширения:**
- `ISocketHandler` / `SOCKET_HANDLER` — входящие события (onConnection)
- `ISocketEventListener` / `SOCKET_EVENT_LISTENER` — EventBus → socket emit (register)
- Helpers: `asSocketHandler(cls)`, `asSocketListener(cls)` для удобной регистрации в @Module
