---
name: Authentication & Access Control
description: JWT auth flow, RBAC+Permission модель, wildcard hierarchy, @Security syntax, scope checking logic, token lifecycle
type: project
---

## Схема БД

```
users ──ManyToMany──▶ roles ──ManyToMany──▶ permissions
  │        (user_roles)          (role_permissions)     ▲
  └──ManyToMany (user_permissions)──────────────────────┘
```

User.roles — eager ManyToMany → Role (user_roles)
User.directPermissions — eager ManyToMany → Permission (user_permissions)
Role.permissions — eager ManyToMany → Permission (role_permissions)

## Роли (ERole)

`ADMIN = "admin"` | `USER = "user"` | `GUEST = "guest"`

ADMIN — superadmin bypass: проходит все permission-проверки автоматически.

## Permissions (EPermissions)

```
ALL = "*"                      — superadmin, полный доступ

USER_VIEW = "user:view"        — просмотр пользователей и профилей
USER_MANAGE = "user:manage"    — создание, редактирование, блокировка, назначение ролей

CONTACT_VIEW = "contact:view"
CONTACT_MANAGE = "contact:manage"
CONTACT_ALL = "contact:*"

CHAT_VIEW = "chat:view"
CHAT_MANAGE = "chat:manage"
CHAT_ALL = "chat:*"

MESSAGE_VIEW = "message:view"
MESSAGE_MANAGE = "message:manage"
MESSAGE_ALL = "message:*"

PUSH_MANAGE = "push:manage"
```

При добавлении нового домена — добавлять в enum с иерархией `domain:action`, wildcard `domain:*`.

## JWT Payload (TokenPayload)

```typescript
{ userId, roles: ERole[], permissions: EPermissions[], emailVerified: boolean }
```

**permissions** = union(все role.permissions) ∪ directPermissions — вычисляется при `TokenService.issue()`.
Ноль DB-запросов при проверке — всё из JWT.

## Token Lifecycle

- `issue(user)` → access token (15 мин) + refresh token (7 дней)
- `verify(token, scopes?)` → decode JWT + checkScopes
- `updateTokens(refreshToken)` → verify refresh + issue new pair

## Scope Checking (@Security)

```typescript
@Security("jwt", ["permission:user:view", "permission:user:manage"])
```

**AND-семантика**: ВСЕ scopes должны быть удовлетворены.

Порядок проверки `checkScopes()`:
1. Superadmin bypass: `roles.includes(ADMIN) || hasPermission(perms, "*")` → skip
2. Для каждого scope:
   - `"role:admin"` → проверяет `roles.includes(ERole.ADMIN)`
   - `"permission:user:view"` → проверяет `hasPermission(perms, "user:view")`

## Wildcard Hierarchy

`hasPermission(userPerms, required)`:
1. `userPerms.includes("*")` → true
2. exact match
3. Prefix wildcards: для `"user:view"` проверяет `"user:*"`, для `"wg:server:view"` проверяет `"wg:server:*"` → `"wg:*"`

## @Security в контроллерах — текущее использование

| Scope | Где используется |
|---|---|
| `@Security("jwt")` | Все "my" эндпоинты (user/my, profile/my), changePassword, file CRUD, все chat/contact/message/push endpoints, biometric endpoints |
| `@Security("jwt", ["permission:user:view"])` | GET user/all, user/options, user/{id} |
| `@Security("jwt", ["permission:user:manage"])` | setPrivileges, update/delete other user, roles list |
| `@Security("jwt", ["role:admin"])` | profile/all, profile update/delete other, role permissions set |
| Без @Security | auth sign-up/sign-in, passkeys auth endpoints |

**Примечание:** Chat/Contact/Message/Push модули используют `@Security("jwt")` без permission scopes — авторизация на уровне бизнес-логики (membership checks в сервисах).

## AuthContext в контроллерах

```typescript
const { userId, roles, permissions, emailVerified } = getContextUser(req);
```

`getContextUser(req: KoaRequest)` — извлекает из `req.ctx.request.user`, throws UnauthorizedException если нет.

## AdminBootstrap

При старте:
1. Создаёт admin из `config.auth.admin.email` + `config.auth.admin.password` (bcrypt)
2. `roleService.seedDefaultPermissions()`:
   - ADMIN → [ALL="*"]
   - USER → [USER_VIEW, USER_MANAGE]
   - GUEST → [USER_VIEW]
   - Только если у роли ещё нет permissions

## setPrivileges API

`PATCH /api/user/setPrivileges/{id}` — заменяет roles[] и directPermissions[] пользователя.
Несуществующие роли/permissions автоматически создаются (upsert).
