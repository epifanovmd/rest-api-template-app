---
id: ops/environment
title: Окружение и конфигурация
summary: Требования, env-файлы (какие в git), загрузка и валидация конфигурации, группы переменных, порты dev-сервисов.
layer: project
roles: [developer, devops]
stages: [implementation]
depends_on: []
---

# Окружение и конфигурация

## Требования

- Node.js ≥ 22.13 (`engines`; `.nvmrc` и образ Docker — 24), Yarn 1.
- Docker — для локальных сервисов, e2e и `make local-*`.
- PostgreSQL (в compose — 16), Redis — обязателен в production; S3-совместимое
  хранилище — при `STORAGE_DRIVER=s3`.

## Установка

```sh
yarn                                # + lefthook install (prepare)
cp .env.example .env.development    # подключения уже настроены на dev-сервисы
yarn services:up
yarn dev                            # http://localhost:8181, Swagger — /api-docs
```

## Env-файлы

| Файл                  | В git | Назначение                                                       |
| --------------------- | ----- | ---------------------------------------------------------------- |
| `.env.example`        | да    | полный список переменных с описанием; основа для остальных       |
| `.env.development`    | нет   | `yarn dev`, миграции из исходников                               |
| `.env.production`     | нет   | Docker на хосте (`env_file` в compose, `ENV_FILE` — другой файл) |
| `.env.docker.example` | да    | образец для `make local-*`; копируется в `.env.docker`           |
| `.env.deploy.example` | да    | образец настроек Makefile/деплоя; копия — `.env.deploy`          |

`.gitignore` исключает все `.env*`, кроме трёх `*.example`.

## Загрузка и валидация (`src/config.ts`)

- `NODE_ENV`: `development` | `production` | `test`, по умолчанию **production**
  (`yarn dev` — development, `yarn test` — test).
- Читаются `<корень>/.env.<NODE_ENV>`, затем `<корень>/.env`; переменные процесса не
  перезаписываются, из файлов побеждает первый. Пути — от корня проекта, не от cwd.
- Схема Zod; невалидное значение останавливает запуск.
- В production ошибка запуска: пустой `POSTGRES_PASSWORD`, `*` в
  `CORS_ALLOWED_ORIGINS`, нет `REDIS_URL`, `STORAGE_DRIVER=s3` без `S3_BUCKET` и ключей.
- В тестах `JWT_SECRET_KEY` и учётка администратора имеют тестовые умолчания.
- Настройки модуля — не в `config.ts`, а в `<feature>.config.ts` через
  `defineModuleConfig` ([tech/recipes](../50-tech/recipes.md)).

## Группы переменных (`.env.example`)

| Группа        | Переменные                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App / Server  | `APP_NAME`, `APP_ROLE` (`api`/`worker`/`all`), `APP_PUBLIC_URL`, `PUBLIC_HOST`, `SERVER_HOST`, `SERVER_PORT` (8181), `TRUST_PROXY`, `API_DOCS_ENABLED`, `API_DOCS_SERVERS` |
| Хранилище     | `STORAGE_DRIVER` (`local`/`s3`), `STORAGE_LOCAL_PATH`, `STORAGE_SIGNED_URL_TTL_SECONDS`, `S3_*` (в т.ч. `S3_PUBLIC_ENDPOINT`, `S3_FORCE_PATH_STYLE`)                       |
| Задачи        | `JOBS_CONCURRENCY`, `JOBS_SHUTDOWN_TIMEOUT_MS`, `JOBS_POOL_MAX`                                                                                                            |
| Наблюдаемость | `METRICS_ENABLED`, `METRICS_TOKEN`, `SENTRY_DSN`, `LOG_LEVEL`, `LOG_PRETTY`                                                                                                |
| Остановка     | `SHUTDOWN_DRAIN_MS`, `SHUTDOWN_INFLIGHT_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`                                                                                                 |
| Redis         | `REDIS_URL`, `REDIS_KEY_PREFIX` (изоляция в общем Redis)                                                                                                                   |
| Лимиты, CORS  | `RATE_LIMIT`, `RATE_LIMIT_INTERVAL`, `CORS_ALLOWED_ORIGINS`                                                                                                                |
| Auth          | `JWT_SECRET_KEY` (≥ 32), `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL_DAYS`, `AUTH_REFRESH_COOKIE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`                                                  |
| OTP / сброс   | `OTP_EXPIRE_MINUTES`, `RESET_PASS_TOKEN_EXPIRE_MINUTES`, `WEB_URL_RESET_PASSWORD`                                                                                          |
| WebAuthn      | `WEB_AUTHN_RP_NAME`, `WEB_AUTHN_RP_HOST`, `WEB_AUTHN_RP_SCHEMA`, `WEB_AUTHN_RP_PORT`                                                                                       |
| БД            | `POSTGRES_*` (host, port, db, user, password, SSL, пул, таймауты, slow query), `DB_MIGRATIONS_RUN`                                                                         |
| SMTP          | `SMTP_HOST` (пусто — почта выключена), `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`                                                                   |

Переменные compose (`ENV_FILE`, `IMAGE`, `TAG`, `API_PORTS`, `S3_ROOT_*`, `S3_PORTS`,
`INFRA_NETWORK`) — [services-compose](services-compose.md); `E2E_*` — [e2e](e2e.md).

Без `SMTP_HOST`: в development и test письмо пишется в лог, в production отправка
отвечает 503.

## Порты dev-сервисов (`docker-compose.dev.yml`)

API (`yarn dev`) — порт 8181. Порты контейнеров сдвинуты, чтобы не конфликтовать с
другими Postgres/Redis/S3 на машине, и слушают только `127.0.0.1`.

| Сервис         | Порт | Учётка / заметки                                       |
| -------------- | ---- | ------------------------------------------------------ |
| Postgres       | 5433 | `postgres` / `postgres`, база `rest_api`               |
| Redis          | 6380 | e2e использует базу `/15`                              |
| Mailpit SMTP   | 1026 | `SMTP_HOST=localhost SMTP_PORT=1026 SMTP_SECURE=false` |
| Mailpit UI     | 8026 | http://localhost:8026                                  |
| S3 (SeaweedFS) | 8334 | `storage` / `storage12345`, bucket-ы `rest-api`, `e2e` |

Другие порты — `POSTGRES_PORT`, `REDIS_PORT`, `SMTP_PORT`, `MAILPIT_UI_PORT`, `S3_PORT`
в окружении `docker compose` (и те же значения в `.env.development`).
