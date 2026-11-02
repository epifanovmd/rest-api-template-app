---
module: core/auth
summary: Аутентификация и проверка прав без знания домена — JWT, реестр схем `@Security`, отзыв токенов, права по userId, хеши паролей.
---

# auth

Ядро доступа: выдаёт и проверяет JWT, диспетчеризует `@Security(name, scopes)` по
реестру схем и проверяет права. Ролей и прав модулей не знает — работает со
`string[]`; из констант знает только суперпользователя.

## Public API

| Экспорт                                                                               | Что                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TokenService`                                                                        | `issue(subject, sessionId)`, `issueTwoFactor`, `verify`/`verifyAccess`, `verifyRefresh`, `verifyTwoFactor`, `revokeSessions`, `revokeUser`, `markPrivilegesChanged` |
| `TokenSubject`, `ITokensDto`, `IIssuedTokens`, `SecurityScopes`                       | контракты выдачи и проверки                                                                                                                                         |
| `SECURITY_SCHEME`, `ISecurityScheme`, `asSecurityScheme`                              | реестр схем для `@Security(name)`                                                                                                                                   |
| `JwtSecurityScheme`                                                                   | схема `jwt`: `Authorization: Bearer <access>`                                                                                                                       |
| `koaAuthentication`, `resetSecuritySchemes`                                           | точка входа tsoa (`tsoa.json → routes.authenticationModule`); сброс кэша схем для тестов                                                                            |
| `AccessService`, `GRANT_RESOLVER`, `IGrantResolver`, `asGrantResolver`, `IUserGrant`  | права по userId из БД (без кэша)                                                                                                                                    |
| `hasPermission`, `ownPermission`, `OWN_SCOPE_SUFFIX`, `isSuperUserGrant`              | wildcard-проверка `a:b:c` → `a:b:*` → `a:*` → `*`; суффикс `:own`                                                                                                   |
| `OwnedAccess`, `resolveScope`, `AccessScope`                                          | области прав «все / свои» для сущностей с владельцем                                                                                                                |
| `SUPERUSER_ROLE`, `ALL_PERMISSIONS`                                                   | `"admin"` и `"*"` — проходят любую проверку                                                                                                                         |
| `getContextUser`, `isSuperUser`, `getDeviceInfo`, `IDeviceInfo`                       | вызывающий из запроса (иначе 401), сведения об устройстве                                                                                                           |
| `hashPassword`, `verifyPassword`, `validatePasswordPolicy`, `PASSWORD_MIN/MAX_LENGTH` | хеш scrypt и политика пароля                                                                                                                                        |
| `hashToken`, `tokenHashMatches`, `TOKEN_HASH_LENGTH`                                  | sha256 для хранения opaque-токенов                                                                                                                                  |
| `AuthTokenError`                                                                      | коды `AUTH_*` (`TOKEN_MISSING/EXPIRED/INVALID/WRONG_SCOPE/NO_SESSION`, `SESSION_REVOKED`, `PRIVILEGES_CHANGED`, `INSUFFICIENT_ROLE/PERMISSIONS`)                    |
| `getSessionRevocations`, `SessionRevocationList`                                      | список отозванных сессий (низкоуровневый, обычно через `TokenService`)                                                                                              |

## Устройство

- **Реестры.** Схемы — `asSecurityScheme(Cls)` в `@Module.providers`; `jwt` регистрирует
  `CoreModule`. `koaAuthentication` собирает карту схем из контейнера один раз и кладёт
  `AuthContext` в `ctx.state.user`. Имя схемы должно совпадать с
  `tsoa.json → securityDefinitions`. `GRANT_RESOLVER` реализует модуль пользователей
  (`asGrantResolver`) — без него `AccessService` не разрешится.
- **Токены.** HS256, `iss`/`aud` = `config.app.name`; назначение (`scope`:
  `access`/`refresh`/`2fa`) зашито в токен и проверяется точно. Access-токен
  проверяется без БД: права — на момент выдачи, `pat` — мс выдачи.
- **Отзыв** (`session-revocation.ts`): отметки `revoked:session:<id>`, `revoked:user:<id>`,
  `privileges:changed:<id>` с TTL = срок access-токена. Пишутся в память процесса и в
  Redis; проверка — память, затем один `MGET` с локальным кэшем 1 с. Отзыв сессии
  важнее смены прав (`AUTH_SESSION_REVOKED` против `AUTH_PRIVILEGES_CHANGED`).
- **Scopes `jwt`** — семантика AND: `role:<r>` и `permission:<p>`; суперпользователь
  проходит всё.
- **Пароли** — `scrypt$N$salt$hash`; bcrypt-хеши `$2…` только проверяются.

## Зависимости

`config`, `core/redis` (отзыв), `core/http` (исключения), `core/decorators`,
`src/app.container` (диспетчер схем), `types/koa.ts` (`AuthContext`). Используют
почти все модули: `getContextUser`, `TokenService` (auth, session, socket),
`AccessService` (profile, socket, user), `OwnedAccess` (file), `ISecurityScheme` (api-key).

## Gotcha

- Страж `core-boundaries.test.ts`: `src/core/**` и `src/types/**` не импортируют
  `src/modules/**`.
- Scope `jwt` без префикса `role:`/`permission:` молча игнорируется — проверку такого
  scope делает сама схема (как `apiKey`).
- Без Redis отзыв виден только своему процессу; недоступный Redis — fail-open с логом.
- `AccessService` всегда идёт в БД: в горячем пути предпочитать права из токена.
