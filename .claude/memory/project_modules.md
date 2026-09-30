---
name: Feature Modules Reference
description: Сводка модулей main (17 каталогов в src/modules) — entities, эндпоинты по тегам, очереди, сокет, бизнес-правила; модель веток (main + example/*). Детали — README модулей
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

## Эндпоинты по тегам OpenAPI (всего 72, все под `/api/v1`)

User 16, Authorization 10, Profile 9, Files 6, Passkeys 6, Biometric 5, Role 4, Jobs 4, Worker 4, Session 3,
ApiKey 3, Audit 2. Контроллеров — 12. Вне спецификации: `/files/*` (storage), системные пробы, `/metrics`,
`/api-docs`.

## Очереди задач (`JOB_HANDLER`)

| Очередь                      | Модуль   | Тип                                       |
| ---------------------------- | -------- | ----------------------------------------- |
| `mail.send`                  | mailer   | служебная, 5 повторов                     |
| `file.process`               | file     | повторы, ставится в транзакции            |
| `jobs.lease-reaper`          | jobs     | cron `* * * * *`                          |
| `jobs.retention`             | jobs     | cron `30 3 * * *` (`JOBS_RETENTION_DAYS`) |
| `session.cleanup`            | session  | cron `0 * * * *`                          |
| `file.cleanup-pending`       | file     | cron `0 * * * *`                          |
| `otp.cleanup`                | otp      | cron `*/30 * * * *`                       |
| `passkeys.challenge-cleanup` | passkeys | cron `*/15 * * * *`                       |
| `audit.cleanup`              | audit    | cron `30 3 * * *`                         |
| `demo.echo`                  | jobs     | external (эталон протокола воркеров)      |

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
