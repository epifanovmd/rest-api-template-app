---
name: Authentication & Access Control
description: JWT auth flow, 2FA, RBAC+Permission модель, wildcard hierarchy, @Security syntax, bot auth, biometric, passkeys, sessions
type: project
---

## Схема БД

```
users ──ManyToMany──▶ roles ──ManyToMany──▶ permissions
  │                                           ▲
  └──ManyToMany──directPermissions────────────┘
```

## Роли (ERole)

- `ADMIN` — суперадмин, bypass всех проверок
- `USER` — обычный пользователь (default)
- `GUEST` — гостевой доступ

## Permissions (EPermissions)

- `* (ALL)` — суперадмин
- `user:view`, `user:manage`
- `contact:view`, `contact:manage`, `contact:*`
- `chat:view`, `chat:manage`, `chat:*`
- `message:view`, `message:manage`, `message:*`
- `push:manage`

## Wildcards

`hasPermission(userPerms, required)`:
- `*` → matches everything
- `chat:*` → matches `chat:view`, `chat:manage`
- `wg:server:*` → matches `wg:server:view`
- Exact match: `user:view` → `user:view`

## JWT Token

**Payload:** `{ userId, roles[], permissions[], emailVerified }`

permissions = объединение(role.permissions) ∪ directPermissions. Вычисляется при issue, без DB hit при verify.

**Сроки:** access 15min (prod) / 1d (dev), refresh 7d.

## @Security syntax

```typescript
@Security("jwt")                                    // любой авторизованный
@Security("jwt", ["role:admin"])                     // только ADMIN
@Security("jwt", ["permission:user:view"])           // нужен user:view
@Security("jwt", ["permission:chat:manage", "role:admin"])  // AND семантика
@Security("bot")                                     // Bot token auth
```

Bypass: role ADMIN или permission `*` → пропускает ВСЕ проверки.

## 2FA (Cloud Password)

**User entity:** twoFactorHash (bcrypt), twoFactorHint

**Flow:**
1. `POST enable-2fa { password, hint? }` → bcrypt hash → save
2. `POST sign-in` → если twoFactorHash есть → return `{ require2FA: true, twoFactorToken (JWT 5min), twoFactorHint }`
3. `POST verify-2fa { twoFactorToken, password }` → verify token + bcrypt compare → issue full tokens
4. `POST disable-2fa { password }` → verify → clear twoFactorHash

## Bot Auth

**Security scheme "bot":**
- Header: `Authorization: Bot <128-char-hex-token>` или `X-Bot-Token: <token>`
- `koa-authentication.ts` → return minimal AuthContext `{ userId: "bot" }`
- Controller извлекает token → `BotService.getBotByToken(token)` → использует `bot.ownerId`

## Biometric Auth

**Entity Biometric:** userId+deviceId(unique), publicKey, challenge, challengeExpiresAt, lastUsedAt

**Flow:**
1. `POST register` → save publicKey (max 5 devices)
2. `POST generate-nonce` → crypto.randomBytes(32) → save challenge (TTL 5min)
3. `POST verify-signature` → crypto.createVerify SHA256 → verify → issue tokens

## Passkeys (WebAuthn)

**Entity Passkey:** id(credentialId), publicKey(Uint8Array), counter, deviceType, transports

**Flow (registration):**
1. `POST generate-registration-options` (jwt) → @simplewebauthn/server → set challenge
2. `POST verify-registration` (jwt) → verify → save passkey → clear challenge

**Flow (authentication):**
1. `POST generate-authentication-options` (public) → find user by login → get passkeys → set challenge
2. `POST verify-authentication` (public) → verify → update counter → issue tokens

## Sessions

**Entity Session:** userId, refreshToken(unique), deviceName, deviceType, ip, userAgent, lastActiveAt

**Endpoints:** GET /api/session, DELETE /api/session/{id}, POST /api/session/terminate-others

**Socket:** `session:terminated` → клиент на другом устройстве разлогинивается
