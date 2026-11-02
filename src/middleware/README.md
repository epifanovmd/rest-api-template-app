---
module: middleware
summary: Сквозные Koa-middleware приложения — requestId, лог доступа, единый формат ошибок, helmet, CORS, глобальный лимит запросов, разбор тела.
---

# middleware

Цепочка Koa, общая для всех маршрутов. Собирает её `src/app.ts`; модули сюда не
добавляют — доменные проверки делаются гардами и декораторами на маршрутах.

## Public API

| Экспорт                                                                                 | Что                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `RegisterBaseMiddlewares`                                                               | `requestId` → `requestLogger` → `error` — для всех маршрутов, включая служебные |
| `RegisterAppMiddlewares`                                                                | `helmet` → `cors` → `rateLimit` → `bodyParser` — для маршрутов API              |
| `notFoundMiddleware`                                                                    | 404 `NOT_FOUND` в общем формате; ставится после всех маршрутов                  |
| `errorMiddleware`, `ErrorResponseBody`                                                  | исключение → `IErrorResponseDto` + `requestId`; 5xx — в лог и Sentry            |
| `requestIdMiddleware`, `REQUEST_ID_HEADER`                                              | `X-Request-ID` из запроса (если uuid) или новый; кладёт в ALS логгера           |
| `isAllowedOrigin`                                                                       | политика origin, общая для HTTP и Socket.IO                                     |
| `createRateLimitMiddleware`, `isRateLimitExempt`                                        | лимит по IP: Redis или память, fail-open                                        |
| `createAppRateLimitMiddleware`                                                          | лимит API по `config.rateLimit`; вызывается в `RegisterAppMiddlewares`          |
| `helmetMiddleware`, `corsMiddleware`, `bodyParserMiddleware`, `requestLoggerMiddleware` | готовые экземпляры                                                              |

## Устройство

Порядок в `App.start`: `metricsMiddleware` (`core/observability`) →
`RegisterBaseMiddlewares` → системные маршруты (`/ping`, `/ready`, `/health`,
`/metrics`) → сырые обработчики (`core/routing`) → `RegisterAppMiddlewares` →
tsoa и маршруты модулей → `notFoundMiddleware`.

- **Ошибки:** `HttpException` → его `status`/`code`; tsoa `ValidateError` → 400
  `VALIDATION_ERROR` (без префикса `body.` в `details`); `MulterError` лимитов → 413,
  прочие → 400 с кодом multer; Postgres `22P02` → 400 `INVALID_PARAMETER`; остальное
  5xx → `INTERNAL_ERROR` с общим сообщением. `stack` — только вне production.
- **Helmet:** для API — `default-src 'none'`, CORP `cross-origin` (файлы API
  показывает фронтенд с другого origin); для `/api-docs` — отдельная CSP под
  Swagger UI, без `upgrade-insecure-requests`.
- **CORS:** `CORS_ALLOWED_ORIGINS`, `*` — любой origin; `credentials: true`;
  разрешены `X-Request-ID`, `X-Device-Name`, `X-Device-Type`.
- **Лимит:** `config.rateLimit`, ключ — `ctx.ip`; пути `/files/*` (подписанные
  ссылки) не считаются. Экземпляр создаёт фабрика `createAppRateLimitMiddleware()` при
  сборке цепочки, а не импорт модуля: общий клиент Redis открывается только тогда
  (тестом не покрыто — ручная проверка: импорт `src/middleware` в скрипте с
  `REDIS_URL` не создаёт соединения в `redis-cli client list`). Ошибка хранилища —
  запрос пропускается с предупреждением;
  ошибки ниже по цепочке пробрасываются как есть.
- **Лог доступа:** `/ping`, `/ready` не логируются; запрос дольше 2 с — `warn`
  (long-poll помечается `longPollSignal` и медленным не считается).
- **Тело:** JSON и формы до 1 МБ; multipart разбирает multer на маршрутах загрузки.

## Зависимости

`config`, `core/logger`, `core/redis`, `core/http`, `core/dto`, `core/db`
(`pgErrorCode`), `core/observability` (`reportError`), `core/storage`
(`STORAGE_ROUTE_PREFIX`), `common/helpers/uuid`. Используют `src/app.ts` и модуль
socket (`isAllowedOrigin`).

## Gotcha

- Системные маршруты стоят до `RegisterAppMiddlewares`: у них нет CORS, helmet и
  лимита, но есть `requestId` и формат ошибок.
- `ctx.ip` за прокси корректен только при `TRUST_PROXY` (`koa.proxy`).
