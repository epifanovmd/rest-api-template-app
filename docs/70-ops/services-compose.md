---
id: ops/services-compose
title: Docker и compose-файлы
summary: Dockerfile (цели api и worker), dev-сервисы, production-стек из compose-файлов, общая инфраструктура хоста, make local-*.
layer: project
roles: [devops, developer]
stages: [implementation, verification]
depends_on: [ops/environment]
---

# Docker и compose-файлы

## Dockerfile

Многостадийная сборка: `deps` → `builder` (`yarn build`) → `prod-deps` → `api` → `worker`.

| Цель     | Что внутри                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `api`    | `node:24-alpine`, `tini` (PID 1), только production-зависимости, `build/`, `templates/`, `USER node`, `VOLUME /app/files`, HEALTHCHECK |
| `worker` | `api` + `ffmpeg`; последняя стадия — цель по умолчанию; годится для любой роли и для миграций                                          |

Build-arg `APP_VERSION` — версия в образе. Сборка только `tsc`, без копирования
файлов и без минификации (имена классов нужны ORM и DI).

## Файлы compose

| Файл                          | Что                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `docker-compose.dev.yml`      | dev-сервисы для `yarn dev` и e2e: Postgres, Redis, Mailpit, SeaweedFS, `s3-init` (bucket-ы `rest-api`, `e2e`); проект `rest-api-dev` |
| `docker-compose.yml`          | production: `migrate` (одноразовый), `api` (`APP_ROLE=api`, образ `:TAG-api`), `worker` (`APP_ROLE=worker`, образ `:TAG`)            |
| `docker-compose.postgres.yml` | Postgres 16 в составе стека (`POSTGRES_PASSWORD` обязателен)                                                                         |
| `docker-compose.redis.yml`    | Redis 7 без persistence, `maxmemory 256mb`, `allkeys-lru`                                                                            |
| `docker-compose.s3.yml`       | SeaweedFS (`S3_PORTS`, по умолчанию 8333) + `s3-init` — идемпотентное создание `S3_BUCKET`                                           |
| `docker-compose.infra.yml`    | вместо трёх предыдущих: подключение к сети общей инфраструктуры хоста (`INFRA_NETWORK`, по умолчанию `infra_data`)                   |

Состав production-стека задаёт `COMPOSE_FILE`:

```sh
export COMPOSE_FILE=docker-compose.yml:docker-compose.redis.yml:docker-compose.postgres.yml:docker-compose.s3.yml
# или общая инфраструктура: COMPOSE_FILE=docker-compose.yml:docker-compose.infra.yml
TAG=<тег> docker compose pull        # или: docker compose build api worker
docker compose run --rm migrate
docker compose up -d                 # --scale api=3 и API_PORTS=8181-8183 — реплики
```

## Production-стек (`docker-compose.yml`)

- `env_file: ${ENV_FILE:-.env.production}`; поверх — `NODE_ENV=production`,
  `TRUST_PROXY=true`, `DB_MIGRATIONS_RUN=false` (схему применяет только `migrate`),
  `STORAGE_DRIVER=s3` по умолчанию, `S3_PUBLIC_ENDPOINT` по умолчанию
  `http://localhost:8333`, `NODE_OPTIONS=--max-old-space-size=768`.
- `api` и `worker` ждут успешного `migrate`; с redis- и s3-файлами — ещё здоровый Redis
  и завершённый `s3-init`.
- Безопасность контейнеров: `read_only`, `tmpfs /tmp`, `cap_drop: ALL`,
  `no-new-privileges`, `init`.
- Healthcheck — `GET /ready`; лимиты памяти: `api` 1 ГБ, `worker` 2 ГБ;
  `stop_grace_period` 55 / 60 с (дожидание запросов и задач при SIGTERM).
- Том `files` → `/app/files` (драйвер `local`).
- Внешний Postgres — без postgres-файла, `POSTGRES_HOST` в env-файле (Postgres этого же
  хоста — `host.docker.internal`); без s3-файла — `STORAGE_DRIVER=local` или внешний S3.
- `S3_PUBLIC_ENDPOINT` — адрес хранилища для клиентов, если API ходит в S3 по
  внутреннему адресу (`http://s3:8333`).

## Общая инфраструктура хоста

С `docker-compose.infra.yml` сервисы `migrate`, `api`, `worker` подключаются к внешней
сети; учётки проекта (`POSTGRES_*`, `REDIS_URL`, `REDIS_KEY_PREFIX`, `S3_*`) — в
env-файле. Dev-сервисы проекта с этой инфраструктурой не связаны.

## Локальный production-стек (`make local-*`)

- Compose-файлы: `docker-compose.yml` + redis + postgres + s3 (`LOCAL_COMPOSE_FILES`).
- Env — `.env.docker` (`LOCAL_ENV_FILE`); при первом `local-up` копируется из
  `.env.docker.example`.
- Образы собираются с тегом `local` (`LOCAL_TAG`), `up -d --build`.
- Порты только на `127.0.0.1`: API 8181, S3 8335 (`S3_PUBLIC_ENDPOINT=http://localhost:8335`).
- `.env.deploy` не нужен.
