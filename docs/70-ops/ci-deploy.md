---
id: ops/ci-deploy
title: CI, релиз и деплой
summary: ci.yml (verify, migrations, e2e, audit, docker, deploy), release.yml (тег v*), deploy.yml (make release на хосте), откат.
layer: project
roles: [devops, reviewer]
stages: [verification, commit]
depends_on: [ops/commands, ops/services-compose]
---

# CI, релиз и деплой

## CI — `.github/workflows/ci.yml`

Запуск: push и pull request в `main`. На `main` новый push не отменяет идущий прогон
(деплой посреди миграции не обрывается), в PR — отменяет.

| Job          | Что проверяет                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `verify`     | `yarn generate` + `git diff --exit-code -- src/routing`, `lint`, `typecheck`, `test`, `build`                 |
| `migrations` | чистый Postgres: `migration:run`, затем `migration:generate …/CiDrift` не должен создать файл                 |
| `e2e`        | после `verify`; матрица `storage: [s3, local]`; Postgres, Redis, Mailpit — services, SeaweedFS — `docker run` |
| `audit`      | `yarn audit` production-зависимостей, падает на high/critical, `continue-on-error`                            |
| `docker`     | после `verify`; цели `api` и `worker`, Trivy (CRITICAL/HIGH, `ignore-unfixed`) — блокирует                    |
| `deploy`     | только push в `main` после `verify`, `migrations`, `e2e`, `docker` и при заданной `DEPLOY_ENV`                |

На push в `main` job `docker` публикует образы в ghcr с тегом коммита:
`ghcr.io/<repo>:<sha>` (worker) и `<sha>-api`. В PR образы только собираются и
проверяются.

Node в CI — из `.nvmrc`, установка `yarn install --frozen-lockfile --ignore-scripts`.

## Release — `.github/workflows/release.yml`

- Тег `v*`; job `on-main` проверяет, что помеченный коммит входит в `main`.
- Образы `worker` (без суффикса) и `api` (`-api`), `linux/amd64` + `linux/arm64`,
  в ghcr; теги — semver (`1.2.3`, `1.2`), имя тега, короткий sha, `latest`.
- `APP_VERSION` = имя тега.

## Deploy — `.github/workflows/deploy.yml`

Вызывается из CI (тег = sha коммита) или вручную (`workflow_dispatch`, тег — sha уже
собранного CI коммита; пусто — текущий). Работает только с `main`; одновременно — один
деплой (`deploy-production`).

1. `DEPLOY_ENV` (переменная репозитория, содержимое `.env.deploy`) → `.env.deploy`;
   ключ — секрет `SSH_PRIVATE_KEY`.
2. `make compose` — compose-файлы на хост (с повторами).
3. Секрет `PRODUCTION_ENV` (содержимое `.env.production`), если задан, → `make env`;
   иначе используется файл, уже лежащий на хосте.
4. `make release TAG=<sha>` = `compose` → `pull` → `migrate` → `up`. На хосте ничего не
   собирается.
5. `latest` и `latest-api` в ghcr перевешиваются на выложенный коммит.

Без `DEPLOY_ENV` (форки шаблона) CI деплой пропускает.

## Откат и ручная выкладка

- Откат — `make release TAG=<sha прошлого коммита>` или ручной запуск Deploy с этим тегом.
- `make deploy` — запасной путь без CI и registry: rsync исходников (кроме
  `.deployignore`), сборка образов на хосте по очереди (`api`, затем `worker`),
  миграции, запуск.
- Настройки хоста — `.env.deploy`: `SSH_HOST`, `SSH_USER`, `SSH_PROJECT_DIR`,
  `SSH_OPTS`, `ENV_FILE`, `COMPOSE_FILES`, `COMPOSE_PROFILES`, `IMAGE`, `DB_*`.

Состав стека на хосте задаёт `COMPOSE_FILES` — свои Postgres/Redis/S3 или общая
инфраструктура ([services-compose](services-compose.md)).
