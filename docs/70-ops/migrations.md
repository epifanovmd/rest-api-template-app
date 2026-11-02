---
id: ops/migrations
title: Миграции БД
summary: Схема только в миграциях — генерация, список применения, запуск при старте и отдельным шагом, проверки CI.
layer: project
roles: [developer, devops]
stages: [implementation, verification]
depends_on: [ops/commands]
---

# Миграции БД

## Принципы

- Схема БД живёт только в миграциях: `synchronize: false` во всех окружениях.
- Сущности регистрируются в `@Module({ entities })`; `src/data-source.ts` собирает их из
  дерева модулей (`collectEntities(AppModule)`) — поиска файлов по маске нет.
- Миграции применяются в порядке списка `src/migrations/index.ts`, а не по имени файла.
- Применённая миграция не редактируется: изменение схемы — новая миграция.
- Смена смысла прав или данных — миграция данных (роли, `user_permissions`, scopes
  `api_keys`), а не правка кода засева.
- pg-boss держит свою схему `pgboss` и мигрирует её сам.

## Новая миграция

```sh
yarn services:up                                  # БД с применёнными миграциями
yarn migration:run                                # догнать схему
yarn migration:generate src/migrations/<Имя>      # разница сущностей и схемы
```

Затем: проверить SQL в `up`/`down`, добавить класс в конец массива `migrations` в
`src/migrations/index.ts`, прогнать `yarn migration:run` и `yarn migration:revert`.
CLI TypeORM читает `src/data-source.ts` — в нём ровно один экспорт DataSource.

## Применение

| Где              | Как                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `yarn dev`, e2e  | при старте приложения (`DB_MIGRATIONS_RUN=true`, по умолчанию)                                   |
| несколько реплик | `runMigrations` под `pg_advisory_lock`, `transaction: "each"` — применяет одна реплика           |
| Docker / хост    | одноразовый сервис `migrate` (`docker compose run --rm migrate`, `make migrate`), образ `worker` |
| из сборки        | `yarn migration:run:prod` (`build/data-source.js`)                                               |

При `DB_MIGRATIONS_RUN=false` (так в production-compose) сервер с ожидающими
миграциями не стартует — ошибка запуска, а не работа на отставшей схеме.

## Проверки CI

Job `migrations` в `ci.yml` на чистом Postgres:

1. `yarn migration:run` — все миграции применяются на пустую базу.
2. `yarn migration:generate src/migrations/CiDrift` — если файл создан, сущности
   разошлись со схемой (забыта миграция) → падение.

Локально то же: после правки сущностей `migration:generate` на догнанной базе не должен
ничего создавать.

## Дампы

`make db-dump` / `make db-restore` — скрипты `src/core/db/dump/*.sh` по SSH на хосте
(`DB_CONTAINER`, `DB_USER`, `DB_NAME`, `DB_DUMP_FILE` в `.env.deploy`).
