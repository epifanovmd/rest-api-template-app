---
paths:
  - "src/**/*.entity.ts"
  - "src/**/*.repository.ts"
  - "src/migrations/**"
  - "src/data-source.ts"
---

# Данные и миграции

- Применённые миграции не правятся: изменение схемы — новая миграция
  (`yarn migration:generate`), добавленная в `src/migrations/index.ts`
  ([entities-migrations](../../docs/30-conventions/entities-migrations.md),
  [ops/migrations](../../docs/70-ops/migrations.md)).
- Nullable-колонка → `| null`; enum-ы — в `<feature>.types.ts`; транзакции — по
  [data](../../docs/20-architecture/data.md).
- Изменение схемы — с `yarn test:e2e` на одноразовых сервисах.
