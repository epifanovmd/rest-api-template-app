---
id: domain/access
title: Доступ — роли, права, аутентификация
summary: Роли и права проекта, wildcard и области «все / свои», схемы jwt и apiKey, токены и сессии, защита суперпользователя.
layer: project
roles: [developer, architect, reviewer]
stages: [analysis, planning, implementation, review]
depends_on: [domain/glossary]
---

# Доступ — роли, права, аутентификация

Детали реализации — README модулей [auth](../../src/modules/auth/README.md),
[session](../../src/modules/session/README.md), [role](../../src/modules/role/README.md),
[permission](../../src/modules/permission/README.md),
[api-key](../../src/modules/api-key/README.md). Как защитить маршрут —
[tech/recipes](../50-tech/recipes.md).

## Роли

| Роль    | Права по умолчанию (`ROLE_DEFAULT_PERMISSIONS`) |
| ------- | ----------------------------------------------- |
| `admin` | `*` — суперпользователь (`SUPERUSER_ROLE`)      |
| `user`  | `file:view:own`, `file:delete:own`              |
| `guest` | `file:view:own`, `file:delete:own`              |

- Роль — строка в БД; новые роли создаются через API без деплоя. Системные роли
  удалить нельзя (409), свою роль не-суперпользователь не удаляет (403).
- Права пользователя = права его ролей ∪ прямые права (`user_permissions`).
- Администратор создаётся на старте из `ADMIN_EMAIL`/`ADMIN_PASSWORD`; засев ролей
  идемпотентен (безопасен при гонке реплик). В development — демо-пользователи
  `alice`, `bob`, `charlie`.
- Ядро о ролях знает только `admin`; остальные роли и права для него — `string[]`.

## Права

| Группа    | Права                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| `*`       | все права                                                                        |
| `user`    | `user:view`, `user:update`, `user:delete`, `user:privileges`                     |
| `role`    | `role:view`, `role:create`, `role:update`, `role:delete`                         |
| `profile` | `profile:view`, `profile:update`, `profile:delete`                               |
| `apikey`  | `apikey:view`, `apikey:create`, `apikey:revoke`                                  |
| `audit`   | `audit:view`                                                                     |
| `file`    | `file:view`, `file:delete` — с областью: есть `file:view:own`, `file:delete:own` |

- Право — на отдельное действие; общего `manage` нет.
- Объявление — `definePermissions` в `<module>.permissions.ts`, экспорт из `index.ts`;
  каталог с подписями — `GET /api/v1/permissions`.
- Wildcard: `a:b:c` покрывается `a:b:*`, `a:*`, `*`.
- Область «все / свои»: право на все покрывает `<право>:own`, `:own` не даёт права на все.
  Сущность не видна актору → 404; видна, но нет права на действие → 403.
- Менять права и роли пользователя (`user:privileges`) может не любой: выдавать `admin`
  и `*` — только суперпользователь, себе — нельзя. Редактировать суперпользователя
  может только суперпользователь (403 `USER_SUPERUSER_EDIT`, `PROFILE_SUPERUSER_EDIT`).

## Схемы аутентификации

| Схема    | Заголовок                                            | Контекст                                                           |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `jwt`    | `Authorization: Bearer <access>`                     | `kind: "user"`, `userId`, `sessionId`, роли и права из токена      |
| `apiKey` | `X-Api-Key: <key>` или `Authorization: ApiKey <key>` | `kind: "service"`, `userId` — владелец ключа, права — scopes ключа |

`@Security("jwt", ["permission:<право>"])` — требование права;
`@Security("jwt", ["role:<роль>"])` — роли. Scope API-ключа: точное совпадение,
wildcard, требование без действия (`reports`) покрывается любым scope домена.
Незарегистрированная схема на маршруте → 500.

## Токены и сессии

- JWT HS256, `iss`/`aud` = `APP_NAME`; `scope`: `access`, `refresh`, `2fa` (5 мин).
- Вход (пароль, 2FA, passkey, биометрия) создаёт сессию; активных сессий — до 10,
  старейшие вытесняются.
- В БД — только sha256 refresh-токена. `/refresh` атомарно ротирует; повтор старого
  refresh завершает сессию (401).
- Access проверяется без БД, но с отзывом через Redis: завершённая сессия →
  `AUTH_SESSION_REVOKED`; смена прав → `AUTH_PRIVILEGES_CHANGED` (клиент делает refresh,
  сессия остаётся). Без Redis — память процесса; ошибка Redis — fail-open.
- Смена или сброс пароля завершает другие сессии; удаление пользователя отзывает все
  его токены.
- `AUTH_REFRESH_COOKIE=true` — refresh дополнительно в httpOnly-cookie
  (`Path=/api/v1/auth`, SameSite=Strict, Secure в production).

## Защита входа

- Блокировка: 5 неудач за 15 мин → 15 мин, 429 `AUTH_ACCOUNT_LOCKED` + `Retry-After`.
- 2FA: 5 неудачных кодов за 15 мин → 429; `twoFactorToken` одноразовый.
- `ThrottleGuard` на маршрутах входа, регистрации и сброса пароля.
- Политика пароля: ≥ 8 символов, не совпадает с email и username, не из списка частых.

## Сокеты

Подключение — access-токен в `handshake.auth.token`; при истечении — `auth:expired`
и разрыв через 30 с без `auth:refresh`. Комнаты списков — по праву просмотра
([realtime](realtime.md)).
