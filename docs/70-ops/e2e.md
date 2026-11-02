---
id: ops/e2e
title: E2E-стенд
summary: Как поднять и запустить e2e, что стенд пересоздаёт в Postgres и Redis, переменные E2E_*, правило одноразовой инфраструктуры.
layer: project
roles: [tester, developer, devops]
stages: [verification]
depends_on: [ops/services-compose]
---

# E2E-стенд

## Правило

Живые прогоны (e2e, ручной запуск сервера с миграциями, проверка сценариев) — только
на одноразовой инфраструктуре: dev-сервисы `docker-compose.dev.yml`, service-контейнеры
CI или свежие контейнеры. **Никогда** против удалённой или рабочей БД, Redis или S3:
стенд удаляет схемы базы и ключи Redis. Если env указывает на чужой хост — остановиться
и спросить пользователя.

## Запуск

```sh
yarn services:up
yarn test:e2e                                   # весь набор
E2E_STORAGE_DRIVER=local yarn test:e2e          # драйвер хранилища — диск
E2E_SERVER_LOG=/tmp/e2e-api.log yarn test:e2e   # журнал копий API в файл (.<порт>)
```

Конфиг — `.mocharc.e2e.yml`: `test/e2e/**/*.e2e.ts`, корневые хуки `test/e2e/setup.ts`,
timeout 30 с. Один сервер на весь прогон.

## Что делает стенд (`test/e2e/harness.ts`)

1. **Postgres.** Имя базы обязано содержать `e2e` или `test` — иначе отказ. Базы нет —
   `CREATE DATABASE` через базу `postgres`; есть — `DROP SCHEMA … CASCADE` всех
   несистемных схем и `CREATE SCHEMA public` (хватает прав владельца базы; схема чужой
   роли — ошибка с подсказкой).
2. **Redis.** С `E2E_REDIS_KEY_PREFIX` — SCAN+DEL ключей префикса (общий Redis с ACL);
   без префикса — `FLUSHDB` базы из URL, база `0` запрещена.
3. **Сервер.** `node --import tsx src/main.ts` дочерним процессом на свободном порту:
   `NODE_ENV=test`, `APP_ROLE=all`, `API_DOCS_ENABLED=true`, `RATE_LIMIT=100000`,
   миграции при старте; ждёт `GET /ready` до 60 с. `startPeerServer()` — вторая копия
   API над той же БД и Redis (сценарии нескольких реплик).

## Переменные

Умолчания — dev-сервисы; CI задаёт стандартные порты явно.

| Переменная                                                    | По умолчанию                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `E2E_POSTGRES_HOST` / `_PORT` / `_USER` / `_PASSWORD`         | `localhost` / `5433` / `postgres` / `postgres`               |
| `E2E_POSTGRES_DB`                                             | `rest_api_e2e`                                               |
| `E2E_REDIS_URL`                                               | `redis://localhost:6380/15`                                  |
| `E2E_REDIS_KEY_PREFIX`                                        | пусто (уходит серверу как `REDIS_KEY_PREFIX`)                |
| `E2E_SMTP_HOST` / `E2E_SMTP_PORT`                             | `localhost` / `1026`                                         |
| `E2E_MAILPIT_URL`                                             | `http://localhost:8026`                                      |
| `E2E_S3_ENDPOINT` / `_BUCKET` / `_ACCESS_KEY` / `_SECRET_KEY` | `http://localhost:8334` / `e2e` / `storage` / `storage12345` |
| `E2E_STORAGE_DRIVER`                                          | `s3` (`local` — диск `files/`)                               |
| `E2E_LOG_LEVEL`                                               | `warn`                                                       |
| `E2E_SERVER_LOG`                                              | не задан — журнал сервера не пишется                         |

## Набор

| Файл                 | Что                                                                              |
| -------------------- | -------------------------------------------------------------------------------- |
| `auth.e2e.ts`        | регистрация, вход и токены, 2FA, сброс пароля, админ из конфига                  |
| `user.e2e.ts`        | профиль, email, пароль и удаление, администрирование, сессии, аудит              |
| `platform.e2e.ts`    | файлы (multipart, прямая загрузка, области прав), API-ключи, биометрия, passkeys |
| `socket.e2e.ts`      | комнаты списков по праву, живые обновления, `room:revoked`                       |
| `zz-coverage.e2e.ts` | последний: каждый path+method из `swagger.json` вызван хотя бы раз               |

Хелперы — `client.ts` (HTTP-клиент, пишет `calledEndpoints`; вход, письма Mailpit:
`mail`, `codeFrom`, `tokenFrom`), `socket.ts` (`connectSocket`). Новый эндпоинт без
e2e-вызова роняет `zz-coverage`. Как писать сценарии — [tech/testing](../50-tech/testing.md).

## CI

Job `e2e` в `ci.yml` гоняет набор матрицей `storage: [s3, local]` на service-контейнерах
Postgres, Redis, Mailpit и SeaweedFS ([ci-deploy](ci-deploy.md)).
