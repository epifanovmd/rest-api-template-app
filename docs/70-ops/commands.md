---
id: ops/commands
title: Команды проекта
summary: yarn и make — проверки (итерация, файл, полная), разработка, сервисы, миграции, генерация, документация, Docker и деплой.
layer: project
roles: [all]
stages: [implementation, verification]
depends_on: []
---

# Команды проекта

Все команды — из корня репозитория.

## Проверки

| Назначение                | Команда                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| быстрая проверка итерации | `yarn lint && yarn typecheck` + `yarn test:file <путь теста>`                                                               |
| тест одного файла / папки | `yarn test:file <path>` (папка — glob: `yarn test:file "src/modules/file/**/*.test.ts"`)                                    |
| полная проверка           | `yarn verify` — generate, lint, typecheck, test, build; плюс `yarn test:e2e` при изменении API, схемы БД или инфраструктуры |
| форматирование файлов     | `yarn prettier --write <файлы>`                                                                                             |
| документация              | `yarn docs:index` — пересборка индексов                                                                                     |

| Команда                  | Что делает                                                                        |
| ------------------------ | --------------------------------------------------------------------------------- |
| `yarn lint` / `lint:fix` | ESLint по `src` и `test` / с автоисправлением                                     |
| `yarn typecheck`         | `tsc --noEmit`                                                                    |
| `yarn test`              | юнит-тесты Mocha (`src/**/*.test.ts`, `NODE_ENV=test`)                            |
| `yarn test:file <path>`  | тесты по пути без `.mocharc.yml` (`--require tsx`, timeout 10 с)                  |
| `yarn test:e2e`          | e2e против настоящего сервера ([e2e](e2e.md)); нужны сервисы (`yarn services:up`) |
| `yarn prettier:fix`      | Prettier по `src/**/*.ts`                                                         |
| `yarn docs:index`        | пересобрать `docs/README.md` и `docs/modules.md`                                  |
| `yarn outdated`          | устаревшие зависимости                                                            |

Перед сдачей задачи обязательна полная проверка; что считается «готово» —
[process/verification](../10-process/verification.md).

## Разработка

| Команда                 | Что делает                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `yarn dev`              | `yarn generate` + `tsx watch src/main.ts` (`NODE_ENV=development`, роль `all`, миграции при старте) |
| `yarn dev:types`        | `tsc --noEmit --watch`                                                                              |
| `yarn dev:routes`       | nodemon: `yarn generate` при изменении `src/modules`                                                |
| `yarn gen:module <имя>` | каркас модуля (`--dry-run` — только список файлов), [codegen](codegen.md)                           |
| `yarn build`            | `yarn generate` + `tsc -p tsconfig.build.json` (`src/` → `build/`)                                  |
| `yarn server`           | `node --enable-source-maps build/main.js` (`NODE_ENV=production`)                                   |

## Сервисы

| Команда              | Что делает                                                               |
| -------------------- | ------------------------------------------------------------------------ |
| `yarn services:up`   | `docker-compose.dev.yml` — Postgres, Redis, Mailpit, S3 (`up -d --wait`) |
| `yarn services:down` | остановить их (данные в томах сохраняются)                               |

Порты и учётки — [environment](environment.md), состав — [services-compose](services-compose.md).

## Миграции и генерация

| Команда                                        | Что делает                                     |
| ---------------------------------------------- | ---------------------------------------------- |
| `yarn migration:generate src/migrations/<Имя>` | миграция из разницы сущностей и схемы БД       |
| `yarn migration:run` / `migration:revert`      | применить ожидающие / откатить последнюю (dev) |
| `yarn migration:run:prod`                      | применить миграции из `build/` (в контейнере)  |
| `yarn generate`                                | `tsoa spec-and-routes` → `src/routing/`        |

Подробно — [migrations](migrations.md), [codegen](codegen.md).

## Makefile — Docker и деплой

`make help` — список целей. Цели `help`, `image`, `local-*` работают без `.env.deploy`,
остальные требуют его (образец `.env.deploy.example`); любое значение переопределяется
в команде: `make release SSH_HOST=…`.

| Команда                                           | Что делает                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `make local-up`                                   | production-стек в Docker на этой машине со своими Postgres, Redis, S3     |
| `make local-ps` / `local-logs` / `local-down`     | состояние / журнал `api` и `worker` / остановить                          |
| `make image`                                      | собрать образы `worker` и `api` локально                                  |
| `make release TAG=<sha>`                          | на хосте: compose-файлы, `pull` образов из ghcr, миграции, запуск         |
| `make deploy`                                     | запасной путь без CI: rsync исходников, сборка на хосте, миграции, запуск |
| `make env`                                        | `ENV_FILE` (по умолчанию `.env.production`) на хост                       |
| `make sync` / `compose`                           | исходники (кроме `.deployignore`) / только compose-файлы на хост          |
| `make build` / `pull` / `migrate` / `up` / `down` | шаги по отдельности на хосте                                              |
| `make status` / `logs` / `restart`                | `ps` / журнал `api` и `worker` / их перезапуск                            |
| `make db-dump` / `db-restore`                     | дамп базы с хоста в файл / восстановление (`DB_*`, `DB_DUMP_FILE`)        |

Подробнее — [services-compose](services-compose.md), [ci-deploy](ci-deploy.md).
