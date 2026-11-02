---
id: tech/http
title: HTTP — маршруты, ошибки, заголовки
summary: Версия API, системные маршруты, порядок middleware, контракт ошибки и маппинг ошибок, helmet/CORS/лимиты, Swagger servers.
layer: project
roles: [developer, reviewer]
stages: [implementation, review]
depends_on: [tech/bootstrap]
---

# HTTP — маршруты, ошибки, заголовки

## Маршруты

- Все маршруты модулей — `api/v1/...` (tsoa `@Route("api/v1/…")`); других путей в
  спецификации нет.
- Вне версии и вне спецификации, без auth, CORS и лимита:

| Маршрут                   | Что                                                                               |
| ------------------------- | --------------------------------------------------------------------------------- |
| `GET /ping`               | liveness, `{ serverTime }`                                                        |
| `GET /ready`              | readiness, `{ status, role }`, 200/503 (старт, потеря БД, остановка)              |
| `GET /health`             | `{ status: ok \| degraded, ready, role, services }` — БД, Redis, SMTP, индикаторы |
| `GET /metrics`            | Prometheus при `METRICS_ENABLED`; с `METRICS_TOKEN` — только `Bearer`             |
| `GET\|HEAD\|PUT /files/*` | раздача и прямая загрузка по HMAC-подписи (драйвер `local`, модуль storage)       |
| `GET /api-docs`           | Swagger UI при `API_DOCS_ENABLED` (в production по умолчанию выключен)            |

`/ping`, `/ready` не пишутся в журнал запросов. На роли `worker` есть только системные
маршруты.

## Порядок middleware

metrics → requestId → requestLogger → error → системные маршруты → raw-обработчики
(`RAW_HTTP_HANDLER`) → helmet → cors → rateLimit → bodyParser → Swagger, tsoa,
`ROUTE_PROVIDER` → notFound.

## Контракт ошибки

`IErrorResponseDto { status, code, message, details?, requestId?, stack? }`
(`core/dto/ErrorResponse.ts`); `requestId` ставит error-middleware, 5xx уходят в Sentry.
Все контроллеры объявляют `@Response<IErrorResponseDto>("default", "Ошибка")`.

| Источник                                     | Ответ                                                       |
| -------------------------------------------- | ----------------------------------------------------------- |
| Zod (`@ValidateBody/Query/Params`)           | 400 `VALIDATION_ERROR`, `details`: путь → сообщение         |
| tsoa `ValidateError` (типы, `UUID` в path)   | 400 `VALIDATION_ERROR`, тот же формат, без префикса `body.` |
| доменная ошибка `defineErrors("PREFIX", …)`  | её `status` и код `PREFIX_<KEY>`                            |
| `fileFilter` загрузки                        | 415                                                         |
| `MulterError` лимитов / прочие               | 413 / 400, `code` — код multer, `details.field`             |
| PG 22P02 (значение не того формата)          | 400 `INVALID_PARAMETER`, SQL наружу не уходит               |
| нарушение уникальности (`isUniqueViolation`) | сервис превращает в 409                                     |
| `ThrottleGuard`                              | 429 `TooManyRequestsException`                              |

## Заголовки и безопасность

- helmet (`middleware/helmet.middleware.ts`): API — CSP `default-src 'none'`,
  `frame-ancestors 'none'`, CORP `cross-origin` (файлы API показываются через `<img>` с
  другого origin); `/api-docs` — своя CSP для Swagger UI **без**
  `upgrade-insecure-requests` (иначе по http браузер переписывает запросы на https).
- CORS — `CORS_ALLOWED_ORIGINS` (общая политика с Socket.IO); принимает
  `X-Request-ID`, `X-Device-Name`, `X-Device-Type`.
- Rate limit — `RATE_LIMIT` запросов за `RATE_LIMIT_INTERVAL` по IP, в Redis; ошибка
  Redis — fail-open.
- `X-Forwarded-*` учитываются только при `TRUST_PROXY=true` (`koa.proxy`).
- `X-Device-Name`/`X-Device-Type`, IP и User-Agent попадают в сессию (`getDeviceInfo`).

## Swagger `servers`

`/api-docs/swagger.json` отдаёт спецификацию с `servers`, вычисленными на каждый
запрос (`core/http/docs-servers.ts`): текущий адрес, `http://localhost:<port>`, IPv4
адреса машины в LAN, `APP_PUBLIC_URL`, `API_DOCS_SERVERS` (csv); без дублей и хвостовых
`/`. `servers` из `tsoa.json` в рантайме перекрываются.
