---
id: domain/glossary
title: Глоссарий
summary: Термины проекта — сессии и токены, права и области, реестры расширения, задачи, хранилище, комнаты сокетов.
layer: project
roles: [all]
stages: [intake, analysis]
depends_on: [domain/overview]
---

# Глоссарий

| Термин                    | Значение                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| модуль                    | каталог `src/modules/<name>/` с `@Module` и public API `index.ts`; список — [modules](modules.md)                       |
| ядро                      | `src/core/` — DI, auth, ошибки, EventBus, контракты задач и хранилища; не знает о модулях                               |
| реестр (токен)            | DI-токен с множеством реализаций (`SECURITY_SCHEME`, `JOB_HANDLER`, …), через который модули расширяют ядро             |
| bootstrapper              | `IBootstrap` — инициализация после загрузки модулей; `critical = false` — сбой не валит запуск                          |
| роль процесса             | `APP_ROLE`: `api`, `worker` или `all` ([overview](overview.md))                                                         |
| сессия                    | запись `sessions`: устройство, хеш refresh-токена, срок; access-токен к ней привязан (`sessionId`)                      |
| access / refresh / 2fa    | значения `scope` JWT; каждая проверка требует точного совпадения scope                                                  |
| ротация refresh           | при `/refresh` выдаётся новый refresh; повтор старого — сессия завершается                                              |
| отзыв                     | пометка в Redis, по которой access-токен отклоняется до истечения (`AUTH_SESSION_REVOKED`)                              |
| смена прав                | отметка `privileges:changed`, после которой старый access отклоняется `AUTH_PRIVILEGES_CHANGED` — клиент делает refresh |
| суперпользователь         | роль `admin` (`SUPERUSER_ROLE`) или право `*` (`ALL_PERMISSIONS`) — проходит любые проверки                             |
| право                     | строка `<домен>:<действие>` (`user:view`), объявляется `definePermissions`; wildcard `a:*`, `*`                         |
| область «все / свои»      | право с `scoped: true` даёт и `<право>:own` — действие только над своими сущностями (`OwnedAccess`)                     |
| API-ключ                  | ключ сервиса (интеграции), схема `apiKey`; `kind: "service"`, scopes ключа — его права                                  |
| схема аутентификации      | `ISecurityScheme` по имени из `@Security("<имя>", scopes)`: `jwt` или `apiKey`                                          |
| задача / очередь          | обработчик `IJobHandler` очереди pg-boss; повторы, отложенный запуск, дедупликация                                      |
| cron-задача               | задача с `cron` в `definition`; запускается ровно одним воркером кластера                                               |
| outbox                    | постановка задачи в той же транзакции, что и данные (`enqueue(…, { manager })`)                                         |
| подписанная ссылка        | URL файла с подписью и сроком: presigned S3 или HMAC-ссылка `/files/*` драйвера `local`                                 |
| проба использования файла | `IFileUsageProbe` — модуль сообщает, какие файлы заняты (нельзя удалить, не собирает GC)                                |
| комната                   | группа сокетов: `user_<id>` (личная), `profile`, комнаты списков (`users`, `roles`, `api-keys`, `audit`)                |
| политика комнаты          | `SOCKET_ROOM_POLICY` — кто может подписаться на комнату (`room:subscribe`); обычно право просмотра                      |
| presence                  | онлайн-статус пользователя: Redis-запись с TTL и heartbeat                                                              |
| аудит                     | запись `audit_events` о событии безопасности: вход, смена пароля, ключи, сессии                                         |
| стенд e2e                 | настоящий сервер над одноразовыми Postgres/Redis/S3/Mailpit ([ops/e2e](../70-ops/e2e.md))                               |
