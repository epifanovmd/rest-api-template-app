---
name: Project Reference
description: Справочник main — стек, карта документации модулей, системные маршруты, Swagger servers, socket-события базы, enum-ы, env по группам. Обновлять свободно при изменениях
type: project
---

# REST API шаблон (базовая платформа, ветка main) — справочник

Эндпоинты, сущности, события и ошибки каждого модуля — в `src/modules/<name>/README.md` (здесь не
дублируются). Точная карта ядра — `project_architecture.md`, сводка модулей, очередей и веток — `project_modules.md`,
доступ — `project_access_control.md`, эталоны и точки расширения — `project_patterns.md`. Спецификация —
`src/routing/swagger.json` (72 операции, все `/api/v1/...`), Swagger UI — `/api-docs`. Предметные модули
(workspace, мессенджер) — в ветках `example/workspaces`, `example/messenger`.

## Стек

| Компонент     | Технология                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime       | Node.js >= 22.13 (Docker 24-alpine), TypeScript ~6, сборка `tsc`                                                                        |
| HTTP          | Koa 3 + tsoa 6.6.0 (закреплён), `@koa/router` 14, `@koa/multer`, koa2-swagger-ui                                                        |
| DI            | inversify 8                                                                                                                             |
| БД            | PostgreSQL 16 + TypeORM 1.x                                                                                                             |
| Очередь задач | pg-boss 12 (схема `pgboss` в той же БД)                                                                                                 |
| Межпроцессное | Redis (ioredis 6), `@socket.io/redis-adapter`                                                                                           |
| Real-time     | Socket.IO 4 (только websocket)                                                                                                          |
| Хранилище     | `@aws-sdk/client-s3` + presigner (S3/SeaweedFS) или локальный диск                                                                      |
| Auth          | jsonwebtoken (HS256), scrypt (bcrypt — только проверка старых хешей), @simplewebauthn/server 14                                         |
| Почта         | nodemailer 10 + EJS, шаблоны `templates/mail/<locale>/`                                                                                 |
| Медиа         | sharp, blurhash, ffmpeg/ffprobe (только образ worker), file-type                                                                        |
| Валидация     | Zod 4                                                                                                                                   |
| Наблюдаемость | pino, prom-client, Sentry                                                                                                               |
| Безопасность  | helmet (koa-helmet), CORS, koa-ratelimit                                                                                                |
| Тесты         | Mocha 12 + Chai 6 + Sinon 22; e2e — `test/e2e` против настоящего сервера                                                                |
| Агенты        | `agent-sdk` 1.0.0 (GitHub Release, github.com/epifanovmd/agent), всё про узлы — `agent/` (воркеры, выпуск `agent/release`, dev, Docker) |

firebase-admin в main нет (push — ветка `example/messenger`).

## Документация модулей (`src/modules/*/README.md`)

agent, api-key, audit, auth, biometric, file, jobs, mailer, otp, passkeys, permission, profile,
reset-password-tokens, role, session, socket, storage, user; ядро наблюдаемости — `src/core/observability/README.md`;
агенты и своя очередь — `src/modules/agent/README.md`; формат сообщений — github.com/epifanovmd/agent `sdk/spec/README.md`.

## Системные маршруты (вне `/api/v1`, без auth/CORS/лимита)

- `GET /ping` — liveness (`{ serverTime }`)
- `GET /ready` — readiness (`{ status, role }`, 200/503)
- `GET /health` — `{ status: ok|degraded, ready, role, services: { database, redis, smtp, jobs, … } }`
  (`jobs` — `JobsHealthIndicator`)
- `GET /metrics` — Prometheus (`METRICS_ENABLED`, Bearer `METRICS_TOKEN`)
- `GET|HEAD|PUT /files/*` — раздача и прямая загрузка по HMAC-подписи (драйвер local), модуль storage
- `GET /api-docs` — Swagger UI (`API_DOCS_ENABLED`, в production по умолчанию выключен);
  `GET /api-docs/swagger.json` — спецификация с `servers`, вычисленными на запрос (ниже)

## Swagger servers (с 25.09.2026)

`src/routing/swagger.ts::RegisterSwagger(router, url, getServers)` отдаёт `{ ...swaggerDoc, servers }`;
`src/core/http/docs-servers.ts::buildDocsServers({ port, origin, publicUrl, extra, interfaces })` — по порядку:
текущий origin (`Current`), `http://localhost:<port>`, IPv4 LAN-адреса машины (`Local network`), `APP_PUBLIC_URL`
(`Public URL`), `API_DOCS_SERVERS` csv (`Remote`, `config.server.docsServers`); без хвостовых `/`, без дублей,
строится на каждый запрос (IP может смениться). Gotcha: origin берётся как
`${ctx.protocol}://${ctx.host}` — `ctx.origin` в Koa 3 это заголовок `Origin`, а не адрес сервера. CSP `/api-docs`
(`middleware/helmet.middleware.ts`) — без `upgrade-insecure-requests` (иначе по http браузер переписывает запросы
Swagger UI на https). `tsoa.json → servers` (localhost) в рантайме перекрывается.

## Guards (`src/core/guards/`)

| Guard                          | Описание                                 |
| ------------------------------ | ---------------------------------------- |
| ThrottleGuard(limit, windowMs) | Лимит на эндпоинт по IP (Redis/память)   |
| RequireVerifiedEmailGuard      | Требует `emailVerified` в контексте      |
| ApiKeyGuard(key, header)       | Статический ключ в заголовке             |
| RequireHttpsGuard              | Только HTTPS (`ctx.secure`, через proxy) |
| IpWhitelistGuard(ips[])        | Только разрешённые IP                    |

## Middleware (порядок)

metrics → requestId → requestLogger → error → [системные маршруты] → helmet → cors → rateLimit (1000/15 мин по
IP по умолчанию) → bodyParser → [swagger, tsoa + ROUTE_PROVIDER] → notFound.

## Socket.IO — события main

Контракт: `src/modules/socket/socket.types.ts` (соединение) + `<feature>.socket-events.ts` модулей
(`declare module "../socket/socket.types"`, см. project_patterns.md).

Клиент → сервер: `ping`, `auth:refresh { accessToken }` (ack `{ ok, expiresAt?, error? }`),
`room:subscribe`/`room:unsubscribe { type, id }` (ack `{ ok }`), `profile:subscribe` (profile). Доменные события
с ack — через `onValidated` (ack `{ ok, data? } | { ok: false, error: { code, message, details? } }`).

Сервер → клиент: соединение — `pong`, `authenticated`, `auth_error`, `auth:expired { graceMs }`,
`error { event, code?, message }`; auth — `auth:2fa-changed`; user — `user:email-verified`, `user:email-changed`,
`user:password-changed`, `user:privileges-changed { roles, permissions }` (эффективные права из БД),
`user:username-changed`; комната `users` (право `user:view`) — `user:updated` (`UserDto`), `user:deleted { id }`;
комната `roles` (`role:view`) — `role:updated` (`IRoleDto`), `role:deleted { id }`; комната `api-keys`
(`apikey:view`) — `apikey:updated` (`ApiKeyDto`); комната `audit` (`audit:view`) — `audit:created`
(`AuditEventDto`, и автору записи); socket — `room:revoked { type, id }` (сокет выведен из комнаты: права
больше нет); profile — `profile:updated` (комната `profile`), `profile:privacy-changed`, `user:online`,
`user:offline`, `presence:init`; session — `session:new`, `session:terminated`; file — `file:processed`;
jobs — `job:updated` (комната задачи, scope-комната и всегда владельцу).

## Enum-ы и константы

```
EFileStatus:       pending | processing | ready | failed
EJobRunStatus:     queued | running | completed | failed | cancelled
EPrivacyLevel:     everyone | contacts | nobody
Roles (const):     admin (= SUPERUSER_ROLE) | user | guest
AuthContext.kind:  user | bot | service   (bot — только в example/messenger)
APP_ROLE:          api | worker | all
```

## Конфигурация (env, полный список с описанием — `.env.example`)

- Приложение/сервер: `APP_NAME`, `APP_ROLE`, `APP_PUBLIC_URL` (адрес в HMAC-ссылках и письмах, `servers` Swagger),
  `APP_VERSION` (образ), `PUBLIC_HOST`, `SERVER_HOST`, `SERVER_PORT` (8181), `TRUST_PROXY`, `API_DOCS_ENABLED`,
  `API_DOCS_SERVERS` (csv доп. адресов Swagger).
- Остановка: `SHUTDOWN_DRAIN_MS`, `SHUTDOWN_INFLIGHT_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`.
- Хранилище: `STORAGE_DRIVER` (local|s3), `STORAGE_LOCAL_PATH` (`./files`), `STORAGE_SIGNED_URL_TTL_SECONDS`
  (3600), `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
  `S3_FORCE_PATH_STYLE`.
- Очередь: `JOBS_CONCURRENCY` (4), `JOBS_SHUTDOWN_TIMEOUT_MS` (20000), `JOBS_POOL_MAX` (4).
- Наблюдаемость: `METRICS_ENABLED`, `METRICS_TOKEN`, `SENTRY_DSN`, `LOG_LEVEL`, `LOG_PRETTY`.
- Redis/лимиты/CORS: `REDIS_URL`, `RATE_LIMIT`, `RATE_LIMIT_INTERVAL`, `CORS_ALLOWED_ORIGINS`.
- Auth: `JWT_SECRET_KEY` (≥ 32), `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL_DAYS`, `AUTH_REFRESH_COOKIE`, `ADMIN_EMAIL`,
  `ADMIN_PASSWORD`, `OTP_EXPIRE_MINUTES`, `RESET_PASS_TOKEN_EXPIRE_MINUTES`, `WEB_URL_RESET_PASSWORD`,
  `WEB_AUTHN_RP_*`.
- БД: `POSTGRES_*` (host, port, db, user, password, ssl, ssl CA, pool, таймауты, slow query), `DB_MIGRATIONS_RUN`.
- Почта: `SMTP_HOST` (пусто — выкл.), `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Env модулей веток-примеров (`WEB_URL_WORKSPACE_INVITE`, `WORKSPACE_INVITE_TTL_HOURS`,
  `FIREBASE_SERVICE_ACCOUNT_PATH`) в main **нет** — они в `<feature>.config.ts` и `.env.example` веток.
- Compose: `ENV_FILE`, `IMAGE`, `TAG`, `API_PORTS`, `S3_ROOT_ACCESS_KEY`/`S3_ROOT_SECRET_KEY`, `S3_PORTS`;
  агенты (сервер) — `AGENT_BOOTSTRAP_TOKEN`, `AGENT_STATUS_INTERVAL_MS`, `AGENT_METRICS_INTERVAL_MS`,
  `AGENT_METRICS_STORE_INTERVAL_MS`, `AGENT_METRICS_RETENTION_HOURS`, `AGENT_EVENTS_RETENTION_DAYS`,
  `AGENT_OFFLINE_GRACE_MS` (3000), `AGENT_RELAY_SECRET`, `AGENT_RELAY_PORT` (8182), `AGENT_RELAY_HOST` (127.0.0.1; compose api — 0.0.0.0), `INSTANCE_URL` (адрес сервера пересылки), `AGENT_RELEASES_DIR`, `AGENT_UPDATE_PUBLIC_KEY`, `AGENT_INSTANCE` (rest),
  `AGENT_PUBLIC_URL`, `AGENT_VALIDATE_EVENTS` (off|log|reject, по умолчанию log); выпуск — `AGENT_SIGNING_KEY`, `AGENT_RELEASE_SRC`, `AGENT_RELEASE_TOOL`, `AGENT_GO_IMAGE`, `AGENT_VERSION`; агент — `AGENT_SERVER_URL`,
  `AGENT_ENROLL_TOKEN`, `AGENT_DATA_DIR`, `AGENT_NAME`, `AGENT_LABELS`, `AGENT_UPDATE_MODE`, `AGENT_CONFIG`.
- E2E: `E2E_POSTGRES_*`, `E2E_REDIS_URL`, `E2E_SMTP_*`, `E2E_MAILPIT_URL`, `E2E_S3_*`, `E2E_STORAGE_DRIVER`,
  `E2E_LOG_LEVEL`, `E2E_AGENT_RELEASES_DIR`, `E2E_AGENT_BIN`; интеграционные юнит-тесты — `TEST_DATABASE_URL`,
  `TEST_S3_ENDPOINT`.
