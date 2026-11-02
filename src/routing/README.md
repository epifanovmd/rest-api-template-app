---
module: routing
summary: Маршруты HTTP — сгенерированные tsoa routes.ts и swagger.json, Swagger UI и служебные маршруты проб и метрик.
---

# routing

Сборка HTTP-маршрутов: сгенерированные tsoa из контроллеров модулей, страница
документации и служебные маршруты вне API.

## Public API

| Экспорт                                                  | Что                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `RegisterRoutes(router, { multer })`                     | маршруты всех контроллеров (`routes.ts`, генерация tsoa)                  |
| `RegisterSwagger(router, url, getServers)`               | `/api-docs` (Swagger UI) и `/api-docs/swagger.json` с `servers` на запрос |
| `RegisterSystemRoutes(router, deps)`, `SystemRoutesDeps` | `/ping`, `/ready`, `/health`, `/metrics`                                  |

## Устройство

- **`routes.ts` и `swagger.json` генерирует tsoa (`yarn generate`) — не
  редактировать вручную.** Источник — контроллеры `src/modules/**/*controller.ts` и
  `tsoa.json` (аутентификация — `core/auth/koa-authentication.ts`, IoC —
  `src/app.container.ts`). Оба файла коммитятся актуальными, CI сверяет
  `git diff` после генерации.
- `swagger.json` импортируется как JSON и попадает в сборку; `servers` подставляются
  на каждый запрос (`buildDocsServers` из `core/http`). Документация включается
  `config.server.docsEnabled`.
- Системные маршруты (`system-routes.ts`) регистрируются до бизнес-middleware и
  поднимаются на всех ролях, включая `worker`; tsoa-маршруты — только не на `worker`.
  `/ready` — флаг готовности и кэш `DbHealthMonitor`; `/health` — живые проверки БД,
  Redis, SMTP (факт настройки) и `HEALTH_INDICATOR` модулей; `/metrics` — при
  `METRICS_ENABLED`, с `METRICS_TOKEN` — только с Bearer. Подробнее —
  [core/observability](../core/observability/README.md).

## Зависимости

`core/http`, `core/db`, `core/redis`, `core/observability`, `config`,
`src/app.container.ts`, `koa2-swagger-ui`. Используется `src/app.ts`.

## Gotcha

- Стражи спецификации (`spec.test.ts`): `operationId` уникален, в телах нет
  невыполнимых схем `string & {}`, каждое право `permission:` в `security` объявлено
  через `definePermissions`.
- Новый эндпоинт без вызова в `test/e2e` роняет e2e-тест покрытия спецификации.
- Пути `ROUTE_PROVIDER` и `RAW_HTTP_HANDLER`, а также системные маршруты в
  `swagger.json` не попадают.
