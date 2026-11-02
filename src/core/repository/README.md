---
module: core/repository
summary: BaseRepository — базовый класс репозиториев TypeORM с транзакциями и привязкой к EntityManager.
---

# repository

Базовый класс для репозиториев модулей. Репозиторий наследует TypeORM `Repository<T>`,
поэтому доступен весь стандартный API плюс несколько помощников.

## Public API

| Экспорт             | Что                                                                                |
| ------------------- | ---------------------------------------------------------------------------------- |
| `BaseRepository<T>` | `createAndSave`, `withTransaction(cb)`, `getRepository(em)`, `createQueryRunner()` |

## Устройство

- Наследник объявляется с `@InjectableRepository(Entity)` и кладётся в
  `@Module.providers`. `ModuleLoader` создаёт его сам: `new Repo(DataSource, entity)` —
  конструктор переопределять не нужно.
- `withTransaction((repo, em) => …)` — транзакция на `manager`; внутри работать через
  переданные `repo`/`em`, не через `this`.
- `getRepository(em)` — тот же репозиторий в чужой транзакции (например, переданной
  сервисом вместе с `manager` для постановки задачи).

## Зависимости

`typeorm`. Используют `core/decorators` (`InjectableRepository`) и репозитории
модулей: api-key, audit, biometric, file, otp, passkeys, permission, profile,
reset-password-tokens, role, session, user.

## Gotcha

- `getRepository(em)` и `withTransaction` возвращают обычный TypeORM `Repository`,
  а не наследника: собственные методы репозитория там недоступны.
- TypeORM 1.x: `select` — только объектом (`{ id: true }`).
