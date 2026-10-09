---
name: Feature Modules Reference
description: Сводка модулей main (18 каталогов в src/modules, с agent) — entities, эндпоинты по тегам, очереди, сокет, бизнес-правила; модель веток (main + example/*). Детали — README модулей
type: project
---

Подробности каждого модуля (сущности, эндпоинты, события, ошибки, задачи) — в `src/modules/<name>/README.md`,
здесь не дублируются. Каркас нового модуля — `yarn gen:module <name>`.

## Ветки (с 25.09.2026)

- `main` — только базовая платформа (ядро, пользователи и доступ, сессии, файлы, задачи, почта, сокеты).
  Предметных модулей нет; блок «Модули проекта» в `src/app.module.ts` пуст.
- `example/workspaces` = main + модуль `workspace` (пространства, участники с ролями, приглашения).
- `example/messenger` = main + chat (с chat-moderation), message, contact, call, poll, sync, push, bot —
  бэкенд фронтенда react-vite.
- `archive/full-before-split` — снимок до разделения (всё вместе), источник для веток-примеров.
- Общий код правится в main и вливается в примеры (`git merge main`); в ветке-примере меняется только код
  её модулей. Модули main не импортируют модули примеров — связь только через точки расширения
  (project_patterns.md «Точки расширения для модулей»).
- Миграции: в main одна базовая `src/migrations/1790353961289-InitialSchema.ts` (только базовые таблицы).
  **Базовую миграцию больше не пересоздавать**; изменение схемы = новая миграция; ветка-пример добавляет свою
  миграцию поверх.
- CI (`.github/workflows/ci.yml`) — на push и pull request в `main`; ветки-примеры CI не запускают.

## Структура модуля

```
src/modules/feature/
├── feature.entity.ts          # TypeORM @Entity
├── feature.repository.ts      # @InjectableRepository, extends BaseRepository
├── feature.service.ts         # бизнес-логика, DataSource для транзакций, JobQueue для задач
├── feature.controller.ts      # tsoa @Route("api/v1/…") + @Response<IErrorResponseDto>("default")
├── feature.module.ts          # @Module
├── feature.types.ts           # enum-ы, const-объекты, лимиты
├── feature.errors.ts          # defineErrors("FEATURE", …)
├── feature.permissions.ts     # definePermissions("feature", …) (если есть права)
├── feature.config.ts          # defineModuleConfig("feature", schema, env) (если есть настройки)
├── feature.socket-events.ts   # declare module "../socket/socket.types" (если есть сокет-события)
├── <aspect>.job.ts            # IJobHandler (asJobHandler)
├── dto/  validation/  events/
├── feature.handler.ts         # ISocketHandler (onValidated)
├── feature.listener.ts        # ISocketEventListener (EventBus → socket / задачи)
├── index.ts                   # public API; экспортирует и *.permissions / *.socket-events
├── README.md
└── feature.service.test.ts
```

## Модули main (по `app.module.ts`)

| Группа          | Модули (entities)                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Инфраструктура  | core, observability (в `src/core`); storage (—), jobs (JobRun), mailer (—), socket (—)                                                                                                                           |
| Вспомогательные | otp (Otp), reset-password-tokens (ResetPasswordTokens), permission (Permission), role (Role)                                                                                                                     |
| Пользователи    | user (User, EmailChangeRequest), profile (Profile, PrivacySettings), file (File), auth (—), session (Session), api-key (ApiKey), audit (AuditEvent), biometric (Biometric), passkeys (Passkey, PasskeyChallenge) |

Порядок в `app.module.ts`: Core → Observability → Storage → Jobs → Mailer/Otp/ResetPasswordTokens →
User/Profile/File/Auth/Session/ApiKey/Audit/Biometric/Passkeys → «Модули проекта» (пусто) → **SocketModule
последним** (multi-inject handlers/listeners/rooms). У permission и role нет своего `@Module`: их сущности,
репозитории и сервисы регистрирует `UserModule` (`entities: [User, Role, Permission, EmailChangeRequest]`).
Bootstrappers: `AdminBootstrap`, `SeedBootstrap` (user; dev-пользователи alice/bob/charlie), `JobsBootstrap`,
`SocketBootstrap`.

## Эндпоинты по тегам OpenAPI (всего 84, все под `/api/v1`; на 07.10.2026)

Всего 103 (09.10.2026): Agent 22, User 16, Node 12, Authorization 10, Profile 9, Files 6, Passkeys 6, Jobs 4,
Biometric 5, Role 4, Session 3, ApiKey 3, Audit 2, Permission 1. Вне спецификации ещё агентские `/api/v1/agent-link/*` (WS, enroll,
releases, install.sh). Вне спецификации: `/files/*` (storage), системные пробы, `/metrics`,
`/api-docs`.

## Очереди задач (`JOB_HANDLER`)

| Очередь                                       | Модуль   | Тип                                              |
| --------------------------------------------- | -------- | ------------------------------------------------ |
| `mail.send`                                   | mailer   | служебная, 5 повторов                            |
| `file.process`                                | file     | повторы, ставится в транзакции                   |
| `jobs.lease-reaper`                           | jobs     | cron `* * * * *`                                 |
| `jobs.retention`                              | jobs     | cron `30 3 * * *` (`JOBS_RETENTION_DAYS`)        |
| `session.cleanup`                             | session  | cron `0 * * * *`                                 |
| `file.cleanup-pending`                        | file     | cron `0 * * * *`                                 |
| `otp.cleanup`                                 | otp      | cron `*/30 * * * *`                              |
| `passkeys.challenge-cleanup`                  | passkeys | cron `*/15 * * * *`                              |
| `audit.cleanup`                               | audit    | cron `30 3 * * *`                                |
| `demo.echo`                                   | jobs     | external (воркер echo: `echo.quick`/`echo.long`) |
| `jobs.external-sync`                          | jobs     | cron `* * * * *` (срок внешних задач)            |
| `agents.prune`                                | agent    | cron `15 * * * *` (события, история метрик)      |
| `node.install-agent` / `node.uninstall-agent` | node     | tracked, SSH                                     |
| `node.netprobe-sync`                          | node     | cron `*/10 * * * *` + после изменений            |

`tracked`-очередей среди модулей main нет (видимость включается `track: true` при постановке или в доменных
модулях). `it.*` — очереди интеграционного теста jobs.

## Сокет

Handlers (2, оба в profile): `ProfileHandler` (`profile:subscribe` → комната `profile`; голый `socket.on`, legacy),
`PresenceHandler` (`presence:init` из `PRESENCE_AUDIENCE.peers`). Listeners (11 файлов `*.listener.ts`): Auth,
User, Role, Profile, Presence, Session, File, Audit, AuditFeed, ApiKey, JobsSocket. Контракт событий —
`socket/socket.types.ts` (соединение, `room:revoked`) + `*.socket-events.ts` модулей (auth, user, role, profile,
session, file, api-key, audit, jobs). Комнаты: `user_<id>` (всегда, `userSocketRoom`), `profile`, `job_<id>`
(policy `job`: суперпользователь, владелец, `IJobAccessPolicy`), списки по праву просмотра через
`permissionRoomPolicy(type, permission)` (id всегда `all`): `users` (user:view), `roles` (role:view, политика и
`RoleListener` регистрируются в `UserModule`), `api-keys` (apikey:view), `audit` (audit:view). Room provider-ов нет.
Подписки — `SocketRoomService` (`subscribe/unsubscribe`, запись в `socket.data.subscriptions`, переживает
`auth:refresh`); `revalidateUser(userId)` (fetchSockets — все реплики) выводит из комнат без права с
`room:revoked`: вызывается `UserListener` на `UserPrivilegesChangedEvent` (удаление роли →
`notifyUsersPrivilegesChanged(memberIds)` → тот же путь). Живые списки: `UserChangedEvent` (создание, смена
контактов) + privileges/email/username/profile события → `user:updated`; `RoleCreated/PermissionsChanged/Deleted`
→ `role:updated/deleted`; `ApiKeyCreated/Revoked` → `apikey:updated` (`ApiKeyService.get`); `AuditRecordedEvent`
→ `audit:created`. Списки файлов — без живых обновлений (только `file:processed` владельцу).

## Итого (25.09.2026)

- 17 сущностей, 72 эндпоинта, 12 контроллеров, 9 очередей (+ `it.*` в тестах)
- юнит: 94 тест-файла, 873 passing / 13 pending; e2e: 4 файла (`auth`, `user`, `platform`, `zz-coverage`)

## Бизнес-правила

Подробности — README модулей. Ключевое:

- **Токены**: JWT со `scope` (`access`/`refresh`/`2fa`), HS256 + `iss`/`aud` = `APP_NAME`; refresh с `jti`,
  в БД только sha256 (`sessions.refresh_token_hash`), атомарная ротация, повтор старого refresh → сессия
  завершается. Reset-пароля — opaque 32 байта (хеш в БД). 2FA: throttle + `AuthAttemptsStore`
  (5 неудач/15 мин), одноразовый `jti`. Сессий максимум 10, `expiresAt`, фоновая очистка.
- **Роли**: `user`/`guest` — только `file:view:own`, `file:delete:own` (засев `ROLE_DEFAULT_PERMISSIONS`,
  литералы + тест объявленности), `admin` — `*`. Новая роль отдаётся с `permissions: []`. `setPrivileges` только существующие роли/права, не себе,
  `admin`/`*` выдаёт только суперпользователь. Засев идемпотентен (гонка реплик).
- **Пользователь**: `POST /api/v1/user/verify-email` (+ `/request`, cooldown 60 с), смена пароля с `currentPassword`
  (`changeOwnPassword`; `changePassword` — только для reset), `POST my/delete` с паролем, смена email сбрасывает
  `emailVerified`. `PublicUserDto` без email, телефон по `showPhone`. Телефон — `normalizePhone`.
- **Приватность/присутствие** (profile): уровни `EPrivacyLevel` `everyone | contacts | nobody`
  (по умолчанию `showLastOnline`/`showAvatar` — everyone, `showPhone` — contacts). Уровень `contacts` решают
  провайдеры `CONTACT_RELATION`, аудиторию `user:online`/`user:offline` и `presence:init` — `PRESENCE_AUDIENCE`
  (`profile.relations.ts`). **В main провайдеров нет**: `contacts` открывает поле только самому пользователю,
  presence не рассылается никому. В `example/messenger` их регистрируют contact и chat.
- **Файлы**: `files.owner_id`; права с областью `file:view`/`file:delete` (+`:own`), `FileAccess`
  (`OwnedAccess` по `ownerId`, без создателя); маршруты `permission:file:<действие>:own`; невидимый — 404, без права
  на действие — 403; `GET /file?mine=false` с `file:view` — все файлы (по умолчанию `mine=true`, operationId
  `getMyFiles` сохранён); загрузка — только jwt. Миграция `OwnFilePermissions` выдала `:own` всем ролям без `*` и
  пользователям без ролей. Прикреплённый (по `FILE_USAGE_PROBE`) — 409;
  в main проб нет. Ключи `files/<id>/…` в `FileStorage`, раздача — подписанные ссылки (`StorageRouteProvider`
  `/files/*` для local, presigned для s3); проверка сигнатуры `file-type`; медиа — задача `file.process`; прямая
  загрузка `POST /file/uploads` + `complete`. Карта подписанных DTO — `file/signed-files.ts` (`TSignedFiles`,
  `signedFileOf`, `signedUrlOf`, `NO_SIGNED_FILES`).
- **Аудит**: `audit_events`, `GET /api/v1/audit/my`, `GET /api/v1/audit` (`audit:view`), cron-очистка 180 дней.

## Агенты (модуль `agent`, agent-sdk 1.0.0 с 09.10.2026)

Агент и SDK — github.com/epifanovmd/agent (локально `../alp-agent`, только читать). Сервер — `Agents` из
`agent-sdk/server` (зависимость — архив GitHub Release
`https://github.com/epifanovmd/agent/releases/download/v1.0.0/agent-sdk-1.0.0.tgz`, `vendor/` нет; ESM, грузится из CJS через require(esm)). Воркеры — HTTP-сервисы
на unix-сокете **без SDK** (обязательны `GET /health`, `GET /manifest`); воркеры проекта — `agent/workers/<имя>`
(main + исполняемый `run` + `VERSION`), демо — `agent/workers/echo` (Python, stdlib, задачи `/jobs`). Выпуск для
узлов — `agent/release` (gitignored, `yarn agent:release` = `agent/release.sh`: агент v<версия agent-sdk из
package.json> с GitHub Release (там только agent-*, manifest, install.sh, sdk — **netprobe в выпуске агента нет**),
свой каталог — только явно `AGENT_RELEASE_SRC`; netprobe — `go build` из `examples/workers/netprobe` модуля агента той же
версии (`go mod download -json …@v<v>` → Dir; версия — const в manifest.go) под все платформы; воркеры проекта →
`<имя>-<версия>-<os>-<arch>.tar.gz`; manifest — утилитой `agent-release` (`AGENT_RELEASE_TOOL` | `agent/tools/` |
`go run …/cmd/agent-release@v<v>` | без Go — сборка в agent/tools в контейнере). Go нет на машине → контейнер
`golang:1.26-bookworm` (`AGENT_GO_IMAGE`), кеш — том `agent-release-go`. С `AGENT_SIGNING_KEY` — всё переподписано
ключом проекта (API — `AGENT_UPDATE_PUBLIC_KEY`), без — подписи агента как были, netprobe и воркеры проекта без
подписи). Экземпляр на узле — `AGENT_INSTANCE` (по умолчанию `rest`, пусто — default): `AgentService.instance()`
→ `installCommand({instance})`, SSH-задачи — `instance` в данных задачи → `install.sh --instance … [--uninstall]`.
Локальный агент пользователя работает из `agent/release/agent-darwin-arm64` — не перезаписывать при проверках
(выпуск для e2e — в копии репозитория, `E2E_AGENT_RELEASES_DIR`). Раскладка `agent/`: README, dev.sh, release.sh,
local/agent.yaml, docker/{Dockerfile,agent.yaml}, workers/, release/, tools/.
Таблицы (миграция `AgentWorkers1791511700000` удалила agent_jobs/commands/states/state_history/state_versions/
job_inputs и старые agents/events/metrics): Store SDK — `agents` (id varchar(64) = 32 hex, rev, record jsonb),
`agent_configs` (PK agent+worker+key, version-счётчик переживает удаление: data NULL); история проекта —
`agent_events` (PK agent_id+id — отсечка повторов onEvent), `agent_metrics` (host/workers jsonb, прореживание
`AGENT_METRICS_STORE_INTERVAL_MS`); `agent_enrollment_tokens`. `job_runs`: agent_id varchar(64), worker,
external_id varchar(128), deadline_at; без files/event_seq/event_at/stop_requested. `nodes.agent_id` → varchar(64)
(обнулён в AgentWorkers), `nodes.agent_name` (миграция `NodeAgentName1791600000000`, заполнена из привязок).
Права: `agent:view|manage|config|fetch|logs|enroll` (state→config, command→fetch+logs, jobs удалено — миграцией).
REST: `/agents` (+ `/alerts`, `/events`, `/{id}`, revoke, delete, rotate-key, update, logs, metrics,
`/{id}/configs`, `/{id}/workers/{w}/restart|update|fetch|configs/{key}`), `/agent-releases`,
`/agent-enrollment-tokens` (22 операции); `/api/v1/agent-link/*` — вне Swagger, `RAW_HTTP_HANDLER`.
Строгость манифеста (SDK от 09.10.2026, тот же 1.0.0): агент пропускает только `routes` (иначе
`AGENT_ROUTE_UNDECLARED` 404), типы задач из `jobs` (`AGENT_JOB_UNKNOWN` 409, во внешней очереди — final),
события из `events`, запросы из `requests`. `AgentRuntime`: `validateConfigs|Jobs|Requests: true`,
`validateEvents` = `AGENT_VALIDATE_EVENTS` (по умолчанию `log`; `invalidEvent` → warn + `agent_events.problems`
(миграция `AgentEventProblems1791800000000`), `reject` — сохраняется из `invalidEvent`, обработчики модулей не
вызываются). Тело не по `routes[].request` — `AGENT_REQUEST_INVALID` 400 (`details.reason`). Каталог возможностей —
`AgentDto.workers[].manifest` (routes.request/response, events.schema, jobs, requests, configs), отдельного
маршрута нет; `routes: open` в данных не видно. Запросы воркеров: core-токен `WORKER_REQUEST_HANDLER`
(`IWorkerRequestHandler {type, workers?, handle}`, `WorkerRequestError(code, message)` → воркеру 422),
нет обработчика — `REQUEST_UNHANDLED`, не тот воркер — `REQUEST_FORBIDDEN`, исключение — `REQUEST_FAILED`.
Демо — `echo.lookup` (`jobs/demo-echo-lookup.handler.ts`: метка `echoPrefix` или `[<имя агента>] `, текст > 200 —
`ECHO_TEXT_TOO_LONG`); echo 1.1.0: `POST /echo {text, repeat?, case?, reverse?}` + событие `echo.echoed`, `POST /emit`.
`subscribeEvents`/`waitEvent` в модулях не используются: job-события нужны до подтверждения (`onEvent`).
Подробно — `src/modules/agent/README.md`.

## Модуль node (узлы с агентами, feat/agent-sdk)

- `nodes` (миграция `1791475124953-Nodes`, agentId → varchar(64) в `AgentWorkers`): name, description, host, ownerId/createdById (FK users SET NULL), agentId (unique, без FK). Статус вычисляется (`node-status.ts`): provisioning (активная задача `node.install-agent`/`node.uninstall-agent`, scope `node/<id>`) → created/error (нет агента) → offline → error (воркер invalid/backoff/stopped, health.ok=false, config ok=false, configStatus failed) → online; сводка `config` — по `agents.configStatus`. Последняя задача — `JobRunRepository.findLatestByScopes` (экспорт из jobs index вместе с `JobRun`).
- Права `node:*` (scoped, кроме create). Доступ к маршрутам агентов: `AgentAccessService` (agent) + политика `NodeAgentAccessPolicy` через `AGENT_ACCESS_POLICY`; маршруты агентов с `*` — `@Security("jwt")`.
- Привязка: `AgentEnrollmentService.withContext` (AsyncLocalStorage) в `AgentRuntime.handle` → `AgentEnrolledEvent(agent, source{tokenId, createdBy, labels})` → метка `nodeId`; без метки — узел без агента, однозначно по `agentName` → `name` → `host` (`findUnbound` + условный `bindFree`), иначе авто-узел. `agentName` хранится и после отвязки.
- SSH: ssh2 (`SSH_SESSION_FACTORY` для тестов), `NodeSecretBox` (`NODE_SECRETS_KEY`, иначе от JWT), `--token-file`, `--worker netprobe`, sudo -n / -S.
- netprobe (release-воркер, `--worker netprobe`): цели — настройка `netprobe/targets` `{targets:[{id: id узла, host, method:"icmp"}], intervalSec, count, timeoutMs}` через `AgentWorkerService.putConfig` (только агентам с воркером netprobe, только при другом содержимом); матрицу считает бэкенд по последней точке `agent.metrics.workers.netprobe` `{at, results[]}` (stale > 2 мин или offline). Очередь `node.netprobe-sync` (cron */10 + после изменений + при появлении агента с netprobe). Dev: блок netprobe в `agent/local/agent.yaml` между метками, `agent/dev.sh` ставит сборку в `<dataDir>/workers/netprobe/current` + `version` или убирает блок.
- Отзыв и удаление агента — только `agent:manage` (политика узла не открывает); `node:agent` — update, rotate-key, restart/update воркеров, configs, fetch.
- Gotcha: `mine` в query-схеме — строка `"true"|"false"` (ValidateQuery подменяет query; boolean ломает tsoa). e2e: `auth сброс пароля` падает и без модуля (письмо приходит позже 15 с).
