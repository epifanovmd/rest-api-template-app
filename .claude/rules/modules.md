---
paths:
  - "src/modules/**"
  - "scripts/gen-module.mjs"
---

# Работа в модуле

- Перед правкой прочитать `README.md` модуля; карта модулей — [docs/modules.md](../../docs/modules.md).
  Изменилось поведение, API, события — обновить README в той же задаче.
- Код — в модуле-владельце; контроллер → сервис → репозиторий → сущность; наружу —
  только DTO ([module-layers](../../docs/20-architecture/module-layers.md)).
- Чужой модуль — только через его `index.ts` (исключение — `*.entity` для связей и репозиториев
  ORM); внутри — относительные пути
  ([dependencies](../../docs/20-architecture/dependencies.md)).
- Регистрация — `@Module.providers`/`entities`; права — `definePermissions`; ошибки —
  `defineErrors` ([extension-points](../../docs/20-architecture/extension-points.md)).
- Место нового кода — [placement](../../docs/20-architecture/placement.md), эталоны —
  [tech/recipes](../../docs/50-tech/recipes.md).
