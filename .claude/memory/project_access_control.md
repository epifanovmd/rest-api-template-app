---
name: Authentication & Access Control
description: Session-bound JWT auth, 2FA, RBAC+Permission, wildcard hierarchy, @Security syntax, bot/biometric/passkey auth, session lifecycle
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

## Роли (ERole)

- `ADMIN` — суперадмин, bypass всех проверок
- `USER` — обычный пользователь (default)
- `GUEST` — гостевой доступ

## JWT Token Structure

**TokenPayload:** `{ userId, sessionId, roles[], permissions[], emailVerified }`

| Токен | Dev | Production |
|-------|-----|-----------|
| Access | 1 день | 15 минут |
| Refresh | 7 дней | 7 дней |
| 2FA temp | 5 минут | 5 минут |
| OTP code | 10 минут | 10 минут |
| Reset password | 60 минут | 60 минут |

## Session-Bound Auth Flow

```
POST /sign-in (login, password, device headers)
  → bcrypt verify → [2FA check]
  → Session.create({userId, refreshToken: "pending", ip, userAgent, device})
  → TokenService.issue(user, session.id) → access + refresh tokens
  → Session.updateRefreshToken(session.id, refreshToken)
  → Return tokens + user data

POST /refresh ({ refreshToken })
  → jwt.verify(refreshToken)
  → Session.findByRefreshToken(token)  ← нет → 401
  → session.userId === decoded.userId?  ← нет → 401
  → issue new tokens (same sessionId)
  → Session.updateRefreshToken(newRefreshToken)  ← ротация
  → Return new tokens

DELETE /session/{id}
  → Session.delete → refreshToken мёртв → socket: session:terminated

Password/Privileges change:
  → EventBus → SessionListener → terminateAllByUser()
  → все сессии удалены → все refresh tokens мертвы
```

## IDeviceInfo

Извлекается из request headers в контроллере:
- `ip` — req.ctx.request.ip
- `userAgent` — User-Agent header
- `deviceName` — X-Device-Name header
- `deviceType` — X-Device-Type header

## 2FA Flow

1. `enable2FA(userId, password, hint?)` → bcrypt hash → user.twoFactorHash + twoFactorHint
2. `signIn` → если twoFactorHash → return `{ require2FA: true, twoFactorToken(5min), hint }`
3. `verify2FA(twoFactorToken, password, deviceInfo)` → verify 2FA password → create session → tokens
4. `disable2FA(userId, password)` → verify → set null

## Alternative Auth Methods

**Biometric:** challenge-response RSA SHA256. `verifySignature()` → создаёт Session → issue tokens.
**Passkeys (WebAuthn):** FIDO2 protocol. `verifyAuthentication()` → создаёт Session → issue tokens.
**Bot:** `Authorization: Bot <token>` → минимальный AuthContext без session.

## Permission System

**Формат:** `module:action` — например `chat:view`, `user:manage`, `profile:view`

**Wildcard иерархия:**
- `chat:message:delete` → exact match
- `chat:message:*` → parent wildcard
- `chat:*` → root wildcard
- `*` → superadmin

**Вычисление при выдаче токена:**
```
effectivePermissions = Set(
  flatMap(user.roles → role.permissions.name) +
  user.directPermissions.name
)
```

**Проверка (hasPermission):** split by `:`, try progressively shorter prefixes with `:*`.

**@Security синтаксис:**
```typescript
@Security("jwt")                                    // только авторизация
@Security("jwt", ["permission:chat:view"])          // нужен permission
@Security("jwt", ["permission:user:manage"])        // admin endpoints
```

## Session Entity

```
sessions {
  id: UUID (PK)
  userId: UUID (FK → users, CASCADE)
  refreshToken: varchar(500) (unique index)
  deviceName?: varchar(200)
  deviceType?: varchar(50)
  ip?: varchar(45)
  userAgent?: varchar(500)
  lastActiveAt: timestamp
  createdAt: timestamp
}
```

## Session Events

- `SessionTerminatedEvent(sessionId, userId)` → socket `session:terminated`
- `PasswordChangedEvent` → SessionListener → terminateAllByUser
- `UserPrivilegesChangedEvent` → SessionListener → terminateAllByUser

## Auth Events

- `UserLoggedInEvent(userId, sessionId?)` → socket `session:new`
- `TwoFactorEnabledEvent(userId)` → socket `auth:2fa-changed { enabled: true }`
- `TwoFactorDisabledEvent(userId)` → socket `auth:2fa-changed { enabled: false }`

## AdminBootstrap

На старте: проверяет наличие admin из config → если нет, создаёт user + role ADMIN + permission `*` + seed default permissions для ролей.
