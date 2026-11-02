# CLAUDE.md

Отвечать на русском.

Шаблон backend-приложения: модульный монолит на Node.js + TypeScript. Koa + tsoa
(маршруты и OpenAPI из декораторов), Inversify (DI), TypeORM + PostgreSQL, pg-boss,
Redis, Socket.IO, S3/диск, Zod, pino, prom-client + Sentry, Mocha. Роль процесса —
`APP_ROLE=api|worker|all`.

## Система знаний

Всё знание о проекте — в одной системе ([устройство](docs/00-meta/doc-system.md)).
Документы не загружены в контекст: читать нужное по карте ниже.

| Нужно                                  | Где                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------- |
| найти документ по теме, роли, этапу    | [docs/README.md](docs/README.md) — индекс                                 |
| понять модуль, найти его по назначению | [docs/modules.md](docs/modules.md) → `src/<модуль>/README.md`             |
| порядок работы над задачей             | [process/workflow](docs/10-process/workflow.md)                           |
| исправить баг                          | [process/bugfix](docs/10-process/bugfix.md)                               |
| куда положить код                      | [architecture/placement](docs/20-architecture/placement.md)               |
| границы модулей и ядра                 | [architecture/dependencies](docs/20-architecture/dependencies.md)         |
| точки расширения ядра                  | [architecture/extension-points](docs/20-architecture/extension-points.md) |
| как оформлять код                      | `docs/30-conventions/` — по теме из индекса                               |
| эталонный код модулей                  | [tech/recipes](docs/50-tech/recipes.md)                                   |
| модули, права, события                 | `docs/60-domain/`                                                         |
| команды, окружение, e2e, CI/деплой     | [ops/commands](docs/70-ops/commands.md), `docs/70-ops/`                   |
| git и коммиты                          | [process/git](docs/10-process/git.md)                                     |
| противоречие или нет правила           | [meta/priority](docs/00-meta/priority.md)                                 |

Правила области подгружаются автоматически при работе с её файлами
(`.claude/rules/`). Процедуры — skills: `/task`, `/bugfix`, `/review`, `/new-module`,
`/propose-rule`; только по команде пользователя — `/commit`, `/docs-edit`.
Роли-субагенты — `.claude/agents/` ([process/roles](docs/10-process/roles.md)).

## Этапы любой задачи

0. Приём → 1. Анализ (README модулей, документы из индекса) → 2. **План — показать и
   дождаться подтверждения** → 3. Итерации (после каждой — быстрая проверка) → 4. `yarn verify` (+ `yarn test:e2e` при изменении API, схемы БД, инфраструктуры) → 5. Ревью diff → 6. README модулей, предложения в inbox → 7. Итог. Подробно —
   [process/workflow](docs/10-process/workflow.md).

## Инварианты

- **Ничего не выдумывать.** Место кода, паттерн, имя — по документам и рецептам. Нет
  правила или правила противоречат — остановиться и спросить, а не решать самому.
- Модульный монолит: код — в модуле-владельце (`src/modules/<feature>/`); контроллер →
  сервис → репозиторий → сущность; наружу — только DTO; чужой модуль — через его
  `index.ts`, кроме `*.entity` для связей и репозиториев ORM ([module-layers](docs/20-architecture/module-layers.md)).
- Ядро (`src/core`, `src/types`) не импортирует модули; расширение — токенами-реестрами
  ([extension-points](docs/20-architecture/extension-points.md)).
- DI — только через `@Module.providers`; общее для процессов состояние — в Redis/БД.
- Фоновая работа — задачи очереди, периодическая — `cron`; реакция между модулями —
  `EventBus` после транзакции ([jobs](docs/20-architecture/jobs.md),
  [events-realtime](docs/20-architecture/events-realtime.md)).
- Ошибки — `defineErrors`, сообщения на русском, `throw new Error` в бизнес-коде нет;
  маршруты `api/v1/...`, списки — `IPaginatedDto`/`ICursorPageDto`
  ([http](docs/20-architecture/http.md)).
- Security-scope — право (`definePermissions`), не роль
  ([access](docs/20-architecture/access.md)).
- Все функции стрелочные, хелпер выше использования; `console.*` запрещён
  ([functions](docs/30-conventions/functions.md)).
- **Багфикс через тест**: сначала тест, падающий на текущем коде, потом исправление;
  тест остаётся ([bugfix](docs/10-process/bugfix.md)). Новый эндпоинт — со сценарием e2e.
- Не редактировать вручную: `src/routing/routes.ts`, `src/routing/swagger.json` (tsoa —
  `yarn generate`), применённые миграции (новое изменение схемы — новая миграция).
- Живые прогоны — только на одноразовой инфраструктуре (`yarn services:up`), никогда
  против удалённой БД ([e2e](docs/70-ops/e2e.md)).
- Комментарии — только JSDoc к контрактам и неочевидное, без истории
  ([comments](docs/30-conventions/comments.md)).
- У каждого модуля — `README.md` рядом с кодом; изменил поведение или API — обнови README
  в той же задаче.
- Неиспользуемый существующий код — заготовка: не удалять без команды пользователя.
- Commit, push, merge, деплой — только по команде пользователя; коммиты — Conventional
  Commits на русском ([git](docs/10-process/git.md)).

## Защищённые правила

`CLAUDE.md`, `README.md`, `docs/**` (кроме `docs/inbox/`), `.claude/`, `scripts/{docs,git}`,
конфиги линтера и git-хуков меняются **только по явному указанию пользователя**
([protection](docs/00-meta/protection.md)).

Повторяющаяся ситуация без правила, противоречие, устаревший факт в защищённом
документе, указание пользователя вида «всегда / никогда» — **предложить правило**:
файл в `docs/inbox/` по шаблону и пункт в итоговом сообщении (`/propose-rule`).

## Команды

```sh
yarn lint && yarn typecheck         # после каждой итерации (+ yarn test:file <путь>)
yarn verify                         # generate + lint + typecheck + test + build
yarn services:up && yarn test:e2e   # e2e на одноразовых сервисах
yarn docs:index                     # пересобрать индексы документации
```
