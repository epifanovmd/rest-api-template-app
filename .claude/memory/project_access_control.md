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
  `MGET revoked:session:<sid> revoked:user:<uid> privileges:changed:<uid>` + локальный кэш 1 с →
  `SessionRevocationList.check()` → `"revoked"` (401 `AUTH_SESSION_REVOKED`) | `"privileges-changed"`
  (401 `AUTH_PRIVILEGES_CHANGED`) | `null`. `UserDeletedEvent` → `revokeUser` (токены с `iat` ≤ отметки).
  Redis недоступен → fail-open + лог.
- Смена прав без разлогина: access-токен несёт `pat` (мс выдачи); `UserPrivilegesChangedEvent` →
  `TokenService.markPrivilegesChanged(userId)` (ключ `privileges:changed:<id>`, TTL = `JWT_ACCESS_TTL`);
  токены с `pat` ≤ отметки (без `pat` — по `iat` в секундах, с запасом) → `AUTH_PRIVILEGES_CHANGED`;
  клиент делает refresh, сессия остаётся. Отзыв сессии важнее смены прав.
- `SessionCleanupJob` (cron `0 * * * *`, очередь `session.cleanup`) — удаляет просроченные сессии.
- `SessionTerminatedEvent(sessionId, userId, reason)`; reason: sign-out, sign-out-all, terminated,
  others-terminated, evicted, expired, refresh-reuse, password-changed.
- `SessionListener`: `SessionTerminatedEvent` → `session:terminated` + `disconnectSession`;
  `PasswordChangedEvent` → `terminateAllOther` (есть currentSessionId) или `terminateAllByUser`;
  `UserPrivilegesChangedEvent` → `markPrivilegesChanged` (сессии не завершаются); `UserDeletedEvent` →
  `revokeUser` + `disconnectUser`.
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

**Формат:** `module:action` — права на отдельные действия, общего `manage` нет (разбит миграцией
`1790600000000-SplitManagePermissions`: обладатели `manage` получили все действия — роли, прямые права,
scopes API-ключей; down собирает `manage` обратно у имеющих все действия).

**Права модулей — `definePermissions(domain, { key, label }, { KEY: { name, label } })`**
(`permission.registry.ts`; ключ группы — `<domain>` или `<domain>:<сущность>`, право — `<ключ>:<действие>`,
идемпотентно, возвращает замороженный `KEY → имя`). Каталог — `getPermissionCatalog()`, REST
`GET /api/v1/permissions` (jwt) → `{ groups: [{ key, label, permissions: [{ name, label }] }] }`, первая группа
`*` «Система». `PermissionController` зарегистрирован в `UserModule`. Совместимого `Permissions`/`KnownPermission`
нет: `TPermission = string`, `*` — `ALL_PERMISSIONS` из `core/auth/superuser.ts`.

| Группа                        | Права                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `user` «Пользователи»         | `user:view`, `user:update` (контакты), `user:delete`, `user:privileges` (роли и права) |
| `role` «Роли»                 | `role:view`, `role:create`, `role:update` (права роли), `role:delete`                  |
| `profile` «Профили»           | `profile:view`, `profile:update`, `profile:delete` (очистка)                           |
| `apikey` «API-ключи»          | `apikey:view`, `apikey:create`, `apikey:revoke`                                        |
| `audit` «Журнал безопасности» | `audit:view`                                                                           |
| `jobs` «Фоновые задачи»       | `jobs:demo` (демо-задача проверки агентов)                                             |
| `agent` «Агенты»              | `agent:view`, `agent:enroll`, `agent:command`, `agent:revoke`                          |
| `file` «Файлы»                | `file:view`, `file:delete` — scoped, есть `file:view:own`, `file:delete:own`           |

Засев ролей (`RoleService.seedDefaultPermissions`) берёт `getRegisteredPermissions()`. Страж —
`src/routing/spec.test.ts`: каждое `permission:`-право в security спецификации объявлено.

**Права по userId без HTTP-контекста** — `AccessService` ядра (`core/auth/access.ts`: `grantOf`, `can`,
`isSuperUser`, статический `allows`), без кэша, источник — `GRANT_RESOLVER` (`asGrantResolver`), реализует
`UserGrantResolver` модуля user (`grantOfUser(user)` — его же использует `toTokenSubject`). Используют:
политики сокет-комнат (`JobRoomPolicy`, `permissionRoomPolicy`), `UserListener`, `ProfileService`.

**Защита суперпользователя и ролей:**

- `RoleService.deleteRole(actor, id)`: системные роли (`admin`/`user`/`guest`) → 409 `ROLE_SYSTEM_ROLE`;
  свою роль не суперпользователь не удаляет → 403 `ROLE_OWN_ROLE`; до удаления собираются участники
  (`RoleRepository.findMemberIds`, `user_roles`) → `emitAsync(RoleDeletedEvent(roleId, roleName, memberIds))`
  → `UserService.notifyUsersPrivilegesChanged`. `createRole` → `RoleCreatedEvent(roleId, roleName)`.
- `UserService.updateUser(actor, id, body)`: цель — суперпользователь, актор нет → 403 `USER_SUPERUSER_EDIT`.
- `ProfileService.updateProfileOf/clearProfileOf(actor, userId, …)`: то же → 403 `PROFILE_SUPERUSER_EDIT`.
- `JobRoomPolicy` передаёт реальный флаг суперпользователя: `JobsService.canView(userId, id, isSuperUser)`.

**Области прав «все / свои» (scoped):**

- `definePermissions(..., { KEY: { name, label, scoped: true } })` → регистрируется и `<name>:own`
  (засев создаёт оба); каталог отдаёт `{ name, label, own }`. Имя с `:own` в конце напрямую — ошибка;
  scoped-wildcard — ошибка; длина ≤ 100 с учётом `:own`.
- `hasPermission`: право на все (и `x:*`, `*`) покрывает `<право>:own`; `:own` не даёт права на все.
  `OWN_SCOPE_SUFFIX = "own"`, `ownPermission(p)` (`core/auth/has-permission.ts`).
- `core/auth/access-scope.ts`: `AccessScope = "all" | "own"`, `resolveScope(roles, perms, p)`,
  `OwnedAccess<T>({ owner, creator? })` — `scope`, `isOwn`, `can`, `filter` (`{}` / `{ ownedBy }` / `null`),
  `listFilter(actor, p, mine?)`, `ownedCondition(alias)` (`:ownedBy`), `ownedWhere(userId)`; без `creator` —
  «своя» только по владельцу. `AccessService.scope(userId, p)` — по БД.
- Паттерн модуля: `<feature>.access.ts` с `OwnedAccess`; маршрут `@Security("jwt", ["permission:<p>:own"])`
  (его проходит и право на все); сервис `_findFor(actor, id, p)`: нет права просмотра на сущность → 404,
  видима без права на действие → 403; списки — `listFilter`/`filter` → `ownedWhere`.
- Сокет: `OwnedEntityEmitter` (модуль socket, в `SocketModule.providers`): `toOwners(userIds, viewPerm, event, …)`
  лично тем, у кого область `own` (право на все — через комнату списка), `detach(userId, …)` + `revalidateUser`.
- `userDisplayName(user)` (`modules/user/user-name.ts`) — единая функция имени (профиль, иначе email);
  её использует `UserRepository.findOptions`.
- Смена смысла прав — миграция данных (роли, `user_permissions`, scopes `api_keys`), как
  `SplitManagePermissions`.

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
@Security("jwt", ["permission:user:update"])        // admin endpoints
@Security("apiKey", ["reports"])                    // сервис (интеграция); точный scope проверяет сервис
@Security("agent")                                  // агент: Authorization: Agent <id>.<secret>, kind "agent"
```

Scope API-ключа: точное совпадение, wildcard (`reports:*`, `*`), требование без действия (`reports`) покрывается
любым scope домена (`api-key.scopes.ts::scopeSatisfied`).

## Доступ к данным предметных модулей

В main нет ролей внутри сущностей: доступ — глобальные роли/права, для сущностей с владельцем — области
«все / свои» (`OwnedAccess`; образец — модуль file: `file.permissions.ts`, `file.access.ts`, `FileService._findFor`);
задачи — пока владелец/суперпользователь или `IJobAccessPolicy` по scope (в main политик нет), на области не переведены. Роли участника
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
  (`AUTH_TOKEN_MISSING/EXPIRED/INVALID/WRONG_SCOPE/NO_SESSION`, `AUTH_SESSION_REVOKED`, `AUTH_PRIVILEGES_CHANGED`,
  `AUTH_INSUFFICIENT_ROLE/PERMISSIONS`).

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
SessionTerminated (кроме sign-out*), Passkey/Biometric Added/Removed, ApiKey Created/Revoked.
`AuditService.record` после записи эмитит `AuditRecordedEvent(dto)` → `AuditFeedListener`: `audit:created` в
комнату `audit` (право `audit:view`) и автору записи (его журнал `my`).
