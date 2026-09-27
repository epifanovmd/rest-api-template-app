---
name: Authentication & Access Control
description: Session-bound JWT auth, 2FA, RBAC+Permission, wildcard hierarchy, @Security syntax, схемы jwt/apiKey, biometric/passkey auth, session lifecycle, аудит (main)
type: project
---

## Схема БД

```
users ──ManyToMany──▶ roles ──ManyToMany──▶ permissions
  │                                           ▲
  └──ManyToMany──directPermissions────────────┘
  │
  └──OneToMany──▶ sessions (refreshToken, device info)
```

## Роли (const `Roles`, `modules/role/role.types.ts`)

- `admin` (= `SUPERUSER_ROLE` ядра) — суперадмин, bypass всех проверок
- `user` — обычный пользователь (default)
- `guest` — гостевой доступ

Тип `TRole = KnownRole | (string & {})` — только в модуле role; в теле запросов — `RoleName = string`.
Ядро о ролях знает только `SUPERUSER_ROLE`.

## JWT и токены

- Каждый JWT несёт `scope`: `access` | `refresh` | `2fa`; `TokenService.decode` требует точного
  совпадения (`verify` → access, `verifyRefresh`, `verifyTwoFactor`). HS256, `iss`/`aud` = `config.app.name`.
- Access/refresh payload: `{ scope, userId, sessionId, roles[], permissions[], emailVerified }`;
  refresh дополнительно с `jti` (уникален каждый выпуск). 2FA payload: `{ scope: "2fa", userId, jti }`, 5 мин.
- Токен сброса пароля — opaque (32 байта base64url), в БД sha256 (`hashToken` из `core/auth/token-hash.ts`).
- `SocketAuthMiddleware` → `TokenService.verify` → только access.
- Схемы — реестр `SECURITY_SCHEME` (`asSecurityScheme`), `koa-authentication.ts` только диспетчер:
  `jwt` — `core/auth/jwt.scheme.ts`; `apiKey` — `modules/api-key/api-key.scheme.ts`
  (`X-Api-Key` / `Authorization: ApiKey`, `kind: "service"`, `userId` — владелец ключа,
  `sessionId: "apikey:<id>"`, `permissions` — scopes ключа; ошибки `APIKEY_REQUIRED/INVALID` 401,
  `APIKEY_SCOPE_DENIED` 403). Схема `bot` (`kind: "bot"`) и её
  `securityDefinitions` в `tsoa.json` — в `example/messenger`; в main в `AuthContext.kind` осталось только значение.

## Session-Bound Auth Flow

```
sign-in / verify-2fa / passkey / biometric (AuthService.completeLogin)
  → SessionService.createAuthenticatedSession(toTokenSubject(user), deviceInfo)
    → TokenService.issue(TokenSubject, sessionId) → { tokens, refreshExpiresAt }
    → sessions: refreshTokenHash = sha256(refresh), expiresAt = refresh exp
    → старейшие сверх MAX_ACTIVE_SESSIONS (10) завершаются

POST /refresh
  → verifyRefresh (scope refresh) → validateRefresh: сессия по decoded.sessionId,
    userId, expiresAt; хеш не совпал → reuse → сессия завершена, 401
  → issue → rotateRefreshToken: UPDATE … WHERE id AND refresh_token_hash = old,
    affected !== 1 → сессия завершена, 401; обновляет expiresAt, lastActiveAt
```

- Access-токен проверяется без БД, но с отзывом: `SessionService._terminate` удаляет сессии и
  сразу `TokenService.revokeSessions(ids)` → `core/auth/session-revocation.ts`
  (`revoked:session:<id>`, TTL = `JWT_ACCESS_TTL`; без Redis — память). `verify` делает один
  `MGET revoked:session:<sid> revoked:user:<uid>` + локальный кэш 1 с → 401 `AUTH_SESSION_REVOKED`.
  `UserDeletedEvent` → `revokeUser` (токены с `iat` ≤ отметки). Redis недоступен → fail-open + лог.
- `SessionCleanupJob` (cron `0 * * * *`, очередь `session.cleanup`) — удаляет просроченные сессии.
- `SessionTerminatedEvent(sessionId, userId, reason)`; reason: sign-out, sign-out-all, terminated,
  others-terminated, evicted, expired, refresh-reuse, password-changed, privileges-changed.
- `SessionListener`: `SessionTerminatedEvent` → `session:terminated` + `disconnectSession`;
  `PasswordChangedEvent` → `terminateAllOther` (есть currentSessionId) или `terminateAllByUser`;
  `UserPrivilegesChangedEvent` → `terminateAllByUser`; `UserDeletedEvent` → `disconnectUser`.
- `resetPassword` — единственная точка: `update2FA(null)` + `UserService.changePassword` (без
  события) + `PasswordChangedEvent(userId, "reset")`.

## IDeviceInfo

`getDeviceInfo(req)` из `core/auth/user-context.ts`: ip, User-Agent, `X-Device-Name`, `X-Device-Type`.

## 2FA Flow

1. `enable2FA(userId, currentPassword, password, hint?)` / `disable2FA(userId, currentPassword, password)` —
   нужен пароль аккаунта (403), пароль 2FA ≥ 6.
2. `signIn` → при `twoFactorHash` → `{ require2FA, twoFactorToken, twoFactorHint }`.
3. `verify2FA` (ThrottleGuard `auth:verify-2fa`) → неудачи на пользователя в `AuthAttemptsStore`
   (Redis | память), 5 за 15 мин → 429; jti гасится `claimOnce` при успехе.

## Alternative Auth Methods

**Biometric:** публичные `generate-nonce { userId, deviceId }` и `verify-signature { userId, deviceId, nonce, signature }`;
nonce гасится атомарно до проверки подписи (`BiometricRepository.consumeChallenge`).
**Passkeys:** `GET /api/v1/passkeys`, `DELETE /api/v1/passkeys/{id}` (204); verify-authentication → 401 без credential id;
`PasskeyChallengeCleanupJob` (cron `*/15 * * * *`) чистит challenge; `OtpCleanupJob` (cron `*/30`) — просроченные OTP.
**OTP / reset:** одноразовость через удаление по условию + `affected === 1`; OTP — 5 попыток, cooldown 60 с.

## Permission System

**Формат:** `module:action` — например `user:manage`, `profile:view`, `jobs:manage`

**Справочник `Permissions`** (`modules/permission/permission.types.ts`, «совместимость»): `*`, `user:view/manage`,
`role:view/manage`, `profile:view/manage`, `apikey:manage`, `audit:view` — только базовые; права
мессенджера/пространств из него убраны (объявляются модулями веток). Тип `TPermission` — только в модуле
permission; в теле запросов — `PermissionName = string`.

**Права модулей — `definePermissions`** (`permission.registry.ts`, валидация формата `<domain>:<action>`,
идемпотентно): `apikey:manage`, `audit:view`, `jobs:manage`, `profile:view/manage`, `role:view/manage`,
`user:view/manage` (файлы `<module>.permissions.ts`, экспорт из `index.ts`). Засев ролей (`RoleService.seedDefaultPermissions`) берёт
`getRegisteredPermissions()`; новый модуль общий список не правит.

**Wildcard иерархия:**

- `a:b:c` → exact match
- `a:b:*` → parent wildcard
- `a:*` → root wildcard
- `*` → superadmin

**Вычисление при выдаче токена:**

```
effectivePermissions = Set(
  flatMap(user.roles → role.permissions.name) +
  user.directPermissions.name
)
```

**Проверка (hasPermission):** split by `:`, try progressively shorter prefixes с `:*`.

**@Security синтаксис:**

```typescript
@Security("jwt")                                    // только авторизация
@Security("jwt", ["permission:audit:view"])         // нужен permission
@Security("jwt", ["permission:user:manage"])        // admin endpoints
@Security("apiKey", ["worker"])                     // сервис; точный scope worker:<queue> проверяет сервис
```

Scope API-ключа: точное совпадение, wildcard (`worker:*`, `*`), требование без действия (`worker`) покрывается
любым scope домена (`api-key.scopes.ts::scopeSatisfied`).

## Доступ к данным предметных модулей

В main нет ролей внутри сущностей: доступ — глобальные роли/права + владелец (`ownerId`) + суперпользователь;
задачи — владелец/суперпользователь или `IJobAccessPolicy` по scope (в main политик нет). Роли участника
пространства (`owner ⊃ admin ⊃ editor ⊃ viewer`, `WorkspaceAccessService`, `@WorkspaceRole`) — ветка
`example/workspaces`.

## Session Entity

`sessions { id, userId (FK CASCADE), refreshTokenHash varchar(64) unique, expiresAt, deviceName, deviceType, ip, userAgent, lastActiveAt, createdAt }`

## Auth Events

- `UserLoggedInEvent(userId, sessionId?)` → socket `session:new`
- `TwoFactorEnabledEvent(userId)` → socket `auth:2fa-changed { enabled: true }`
- `TwoFactorDisabledEvent(userId)` → socket `auth:2fa-changed { enabled: false }`

## AdminBootstrap

На старте: проверяет наличие admin из config → если нет, создаёт user + role ADMIN + permission `*` + seed default permissions для ролей.

## Ядро без домена (с 25.09.2026)

- `core/auth` и `types/koa.ts` не импортируют модули: роли/права — `string[]`, суперпользователь —
  `SUPERUSER_ROLE = "admin"`, `ALL_PERMISSIONS = "*"` (`core/auth/superuser.ts`), `isSuperUserGrant`.
  Страж — `core/auth/core-boundaries.test.ts` (core/** и types/** → modules/** запрещено).
- `TokenService.issue(subject: TokenSubject { id, roles, permissions, emailVerified }, sessionId)`;
  субъект собирает `modules/auth/token-subject.ts::toTokenSubject(user)`.
- `TokenService.verifyAccess(token)` → `{ context, expiresAt }` (сокет). Ошибки ядра — `AuthTokenError`
  (`AUTH_TOKEN_MISSING/EXPIRED/INVALID/WRONG_SCOPE/NO_SESSION`, `AUTH_SESSION_REVOKED`, `AUTH_INSUFFICIENT_ROLE/PERMISSIONS`).

## Защита входа

- Блокировка аккаунта `modules/auth/account-lockout.ts`: 5 неудач / 15 мин → 15 мин, 429 `AUTH_ACCOUNT_LOCKED`,
  `details.retryAfter` + `Retry-After` (ставит `withRetryAfter` в контроллере). Ключ `user:<id>` или `login:<логин>`.
  Хранилище — `AuthAttemptsStore` (обобщён: `IAttemptsStore` + `ttlMs`, `AttemptsStore(prefix)`, Memory/Redis).
- Политика пароля `core/auth/password-policy.ts::validatePasswordPolicy` (≥ 8, ≠ email/локальная часть/username,
  не из списка частых). Sign-up/reset — Zod (`validation/account-password.ts`) + сервис; смена — модуль user через
  `asPasswordPolicy(AuthPasswordPolicy)` (auth.module). Новый пароль 2FA ≥ 8, ввод 2FA ≥ 6 (legacy).
- Сброс: `ResetPasswordTokensService.peek` → политика → `check` (токен не сгорает на слабом пароле).

## Refresh-cookie, выход, сокет

- `AUTH_REFRESH_COOKIE`: `refresh_token` httpOnly, Secure в prod, SameSite=Strict, Path=/api/v1/auth
  (`modules/auth/refresh-cookie.ts`); ставят sign-up/in, verify-2fa, refresh, passkey, biometric.
- `POST /auth/sign-out` (204, reason sign-out, чистит cookie), `POST /auth/sign-out-all` (204).
- Сокет: `SocketAuthMiddleware.watch` — `auth:expired { graceMs }` в момент exp, разрыв через 30 с;
  `auth:refresh { accessToken }` + ack `{ ok, expiresAt?, error? }` — только та же сессия и пользователь.

## Аудит (`modules/audit`)

`audit_events` (id, type, actor_id, subject_id, ip, user_agent, meta jsonb, created_at(3)); запись напрямую
в `AuditListener` (asSocketListener), ошибки — лог; `GET /api/v1/audit/my`, `GET /api/v1/audit`
(`permission:audit:view`, `AuditPermissions` через `definePermissions`); cursor-лента; `AuditCleanupJob` 180 дней.
События: UserLoggedIn(method), LoginFailed, AccountLocked, UserSignedOut, 2FA, PasswordChanged,
SessionTerminated (кроме sign-out*), Passkey/Biometric Added/Removed. api-key событий пока нет.
