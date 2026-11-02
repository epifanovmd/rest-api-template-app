---
module: core/db
summary: Подключение к PostgreSQL — фабрика DataSource, миграции под advisory-lock, фоновая проверка БД, коды ошибок Postgres, LISTEN/NOTIFY.
---

# db

Всё, что касается Postgres на уровне процесса: создание `DataSource`, применение
миграций, readiness-проверка и общие утилиты для репозиториев.

## Public API

| Экспорт                                                        | Что                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `createDataSource({ entities, migrations })`                   | `DataSource` из `config.database.postgres`                                           |
| `runMigrations`, `hasPendingMigrations`, `MIGRATIONS_LOCK_KEY` | применение миграций под `pg_advisory_lock`                                           |
| `DbHealthMonitor`                                              | фоновый `SELECT 1` (раз в 10 с, таймаут 2 с) для `/ready`; `probe()` — для `/health` |
| `PG_ERROR`, `pgErrorCode`, `isUniqueViolation`                 | SQLSTATE `23505`, `23503`, `22P02` и их распознавание                                |
| `bigintNumber`                                                 | transformer колонки `bigint` → `number`                                              |
| `PgSignals<TChannel>`                                          | сигналы между процессами через LISTEN/NOTIFY                                         |

Скрипты `dump/dump_db.sh`, `dump/restore_dump_db.sh` — дамп и восстановление базы из
docker-контейнера (локально или по SSH), параметры — в шапке скриптов.

## Устройство

- Схема — только миграции: `synchronize: false`, `migrationsRun: false`; uuid —
  встроенный `gen_random_uuid()` без расширений. Сущности приходят из
  `collectEntities(AppModule)`, миграции — из `src/migrations/index.ts`
  (`src/data-source.ts`, он же `-d` для CLI TypeORM).
- `runMigrations` берёт `pg_advisory_lock(7268650001)`, `transaction: "each"`:
  реплики, стартующие одновременно, применяют миграции по очереди.
- `PgSignals`: одно соединение на экземпляр, переподключение раз в 30 с;
  `notify` с `manager` дойдёт после коммита. Без LISTEN (PgBouncer в transaction
  mode) — `isListening`/`onStatus` сообщают подписчикам, что пора опрашивать БД.
  Модуль наследует класс со своими каналами и регистрирует наследника в DI.

## Зависимости

`config`, `core/logger`. Используют: `src/app.ts` (миграции, монитор),
`src/data-source.ts`, `routing/system-routes.ts` (`probe`),
`middleware/error.middleware.ts` (`22P02` → 400 `INVALID_PARAMETER`),
`isUniqueViolation` — api-key, auth, passkeys, role, user; `bigintNumber` — file.
`PgSignals` в шаблоне наследников не имеет.

## Gotcha

- При `DB_MIGRATIONS_RUN=false` ожидающие миграции — ошибка запуска, а не автоприменение.
- `bigint` больше 2^53 через `bigintNumber` теряет точность — только для размеров и счётчиков.
