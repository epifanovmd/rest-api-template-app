---
id: domain/realtime
title: Реальное время — события и комнаты
summary: Socket.IO проекта — подключение, комнаты и права на них, события клиент → сервер и сервер → клиент по модулям.
layer: project
roles: [developer, architect, tester]
stages: [analysis, planning, implementation]
depends_on: [domain/access]
---

# Реальное время — события и комнаты

Инфраструктура — [socket](../../src/modules/socket/README.md). Контракт событий:
`src/modules/socket/socket.types.ts` (события соединения) + `<module>.socket-events.ts`
модулей (`declare module "../socket/socket.types"`). Как добавить событие —
[tech/recipes](../50-tech/recipes.md).

## Подключение

- Только транспорт websocket; access-токен — `handshake.auth.token`.
- После подключения сокет входит в личную комнату `user_<id>` и получает `authenticated`.
- Истечение токена → `auth:expired { graceMs }`; без `auth:refresh` за 30 с — разрыв.
- Между процессами события идут через Redis-адаптер: воркер и любая реплика API
  могут слать событие любому клиенту.

## Комнаты

| Комната     | Как попасть                               | Условие       | События                        |
| ----------- | ----------------------------------------- | ------------- | ------------------------------ |
| `user_<id>` | автоматически                             | свой сокет    | личные события пользователя    |
| `profile`   | `profile:subscribe`                       | —             | `profile:updated`              |
| `users`     | `room:subscribe { type: "users", id }`    | `user:view`   | `user:updated`, `user:deleted` |
| `roles`     | `room:subscribe { type: "roles", id }`    | `role:view`   | `role:updated`, `role:deleted` |
| `api-keys`  | `room:subscribe { type: "api-keys", id }` | `apikey:view` | `apikey:updated`               |
| `audit`     | `room:subscribe { type: "audit", id }`    | `audit:view`  | `audit:created`                |

- Комната списка одна на тип: `id` в `room:subscribe` игнорируется.
- `room:subscribe` / `room:unsubscribe` отвечают ack `{ ok }`; неизвестный тип комнаты —
  отказ без раскрытия, есть ли она.
- Подписки сохраняются в сокете и переживают `auth:refresh`.
- Потеря права (смена ролей, удаление роли) выводит сокет из комнаты на всех репликах
  с событием `room:revoked { type, id }`.
- Списков файлов в комнатах нет: события файлов получает только владелец.

## Клиент → сервер

| Событие                                            | Ответ                                                          |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `ping { ts }`                                      | `pong { ts }`                                                  |
| `auth:refresh { accessToken }`                     | ack `{ ok, expiresAt?, error? }` — та же сессия и пользователь |
| `room:subscribe` / `room:unsubscribe { type, id }` | ack `{ ok }`                                                   |
| `profile:subscribe`                                | ack `{ ok }`, вход в комнату `profile`; без данных, ≤1/с       |

## Сервер → клиент

| Модуль  | События                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| socket  | `pong`, `authenticated`, `auth_error`, `auth:expired { graceMs }`, `error { event, message }`, `room:revoked { type, id }`                                                                                             |
| auth    | `auth:2fa-changed { enabled }`                                                                                                                                                                                         |
| user    | `user:email-verified`, `user:email-changed`, `user:password-changed`, `user:username-changed`, `user:privileges-changed { roles, permissions }`; в комнату `users` — `user:updated` (`UserDto`), `user:deleted { id }` |
| role    | в комнату `roles` — `role:updated` (`IRoleDto`), `role:deleted { id }`                                                                                                                                                 |
| api-key | в комнату `api-keys` — `apikey:updated` (`ApiKeyDto`)                                                                                                                                                                  |
| audit   | `audit:created` (`AuditEventDto`) — в комнату `audit` и автору записи                                                                                                                                                  |
| profile | `profile:updated` (комната `profile`), `profile:privacy-changed`, `user:online`, `user:offline`, `presence:init`                                                                                                       |
| session | `session:new` (`SessionDto`), `session:terminated`                                                                                                                                                                     |
| file    | владельцу: `file:uploaded`, `file:processed` (`IFileDto`), `file:deleted { id }`                                                                                                                                       |

`user:privileges-changed` несёт эффективные права из БД; access-токен после этого
отклоняется `AUTH_PRIVILEGES_CHANGED` до refresh ([access](access.md)).

## Presence

Аудиторию `user:online`/`user:offline` и состав `presence:init` определяют провайдеры
`PRESENCE_AUDIENCE`, уровень приватности `contacts` — `CONTACT_RELATION` (модуль
profile). В шаблоне провайдеров нет: presence не рассылается никому, поле с уровнем
`contacts` видно только самому пользователю. Провайдеров добавляют модули проекта.
