---
id: tech/recipes
title: Рецепты — где эталон
summary: Где в коде смотреть живой пример каждого паттерна — модуль, ошибки, пагинация, задачи/outbox/cron, хранилище, схемы auth, права, сокеты, e2e.
layer: project
roles: [developer]
stages: [planning, implementation]
depends_on: [tech/bootstrap, domain/access]
---

# Рецепты — где эталон

Правила размещения и зависимостей — [architecture/placement](../20-architecture/placement.md),
[architecture/dependencies](../20-architecture/dependencies.md); именование —
[conventions/naming](../30-conventions/naming.md). Здесь — где взять живой образец.

## Новый модуль

1. `yarn gen:module <name>` — самый актуальный эталон: ошибки, пагинация, 201/204,
   `UUID` в path, `@Response`, тесты ([ops/codegen](../70-ops/codegen.md)).
2. Регистрация в `src/app.module.ts` — в блок модулей проекта, до `SocketModule`.
3. `yarn generate`, миграция ([ops/migrations](../70-ops/migrations.md)), e2e-вызов
   каждого нового эндпоинта.

Компактный живой модуль — `src/modules/api-key/`:

| Паттерн            | Файл                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `@Module`          | `api-key.module.ts` — entities, providers, `asSecurityScheme`, политика комнаты                                          |
| entity             | `api-key.entity.ts` — уникальный `@Index`, `@ManyToOne(..., { onDelete: "CASCADE" })`, `timestamptz`                     |
| repository         | `api-key.repository.ts` — `findAndCount` для страницы                                                                    |
| service            | `api-key.service.ts` — `normalizePagination` + `toPage`, `isUniqueViolation`, событие после записи                       |
| controller         | `api-key.controller.ts` — `@Security("jwt", ["permission:apikey:create"])`, `@ValidateBody`, `@SuccessResponse(201/204)` |
| DTO и тело запроса | `dto/api-key.dto.ts` — `extends BaseDto`, `static fromEntity`, `ICreateApiKeyBody`                                       |
| Zod-схемы          | `validation/create-api-key.validate.ts`, `list-api-keys.validate.ts`                                                     |
| события, права     | `events/api-key.events.ts`, `api-key.permissions.ts`                                                                     |
| listener → комната | `api-key.listener.ts` + `asSocketRoomPolicy(permissionRoomPolicy(...))`                                                  |

## Данные и ошибки

- Доменные ошибки — `defineErrors("PREFIX", {...})` в `<module>.errors.ts`
  (`file.errors.ts`, `user.errors.ts`); в тестах сравнивать `code`.
- Транзакция + событие после коммита — `user.service.ts` (регистрация),
  `email-change.service.ts`: `this._dataSource.transaction(async manager => …)`.
- Пагинация по смещению — `normalizePagination` + `findAndCount` + `toPage` (api-key,
  file, session); курсорная лента — `audit.repository.ts` (`(createdAt, id)`,
  `encodeCursor`/`decodeCursor`).
- 409 на дубликат — `isUniqueViolation(err)` (`core/db/pg-errors.ts`).
- Идемпотентная вставка при гонке реплик — `.insert().orIgnore()`
  (`RoleRepository.grantPermissionsIfMissing`, `PermissionRepository`).
- Атомарный переход состояния — условный `UPDATE … WHERE status IN (…)` + `affected`
  (`FileRepository.transitionStatus`, `SessionService.rotateRefreshToken`).
- События безопасности (смена пароля, прав, удаление) — `await eventBus.emitAsync(...)`:
  к ответу сессии уже отозваны. Остальные — `emit`.

## Задачи

- Служебная очередь с повторами — `mailer/mail-send.job.ts`; неповторяемая ошибка —
  `JobError(code, msg, retryable = false)` (`file/file-process.job.ts`).
- Cron — `*-cleanup.job.ts` (audit, otp, session, passkeys, file): только `cron` в
  `definition`, без `setInterval`.
- Outbox — `file.service.ts::_enqueueProcessing(manager, …)`, `MailerService.send(…, { manager })`.
- `expireInSeconds` не больше 86400 — иначе регистрация отклоняется.
- Health-индикатор — `jobs/jobs.health.ts` (`asHealthIndicator`).

## Файлы и хранилище

- Ключи объектов — `file/file-keys.ts` (`files/<id>/…`); обработка через
  `FileStorage.withLocalFile` — `file-process.job.ts`.
- Прямая загрузка — `file.service.ts`: `signedPutUrl` + `complete` с условным `UPDATE`.
- Подпись ссылок — только `FileUrlService`: `toDtoMap(files)` → `TSignedFiles`; DTO с
  файлами принимают карту и берут ссылки через `signedUrlOf`/`signedFileOf`.
- Занятость файла доменом — `asFileUsageProbe` (образец `ProfileAvatarUsageProbe`);
  передача файла домену — `FileService.adopt`; удаление — `scheduleRemoval(ids, manager)`.

## Доступ

- Право на маршрут — `@Security("jwt", ["permission:user:update"])` (`user.controller.ts`);
  объявление — `user.permissions.ts`.
- Права «все / свои» — модуль file: `definePermissions` с `scoped: true`, `file.access.ts`
  (`OwnedAccess`), маршрут `permission:<p>:own`, сервис `_findFor(actor, id, p)` (404/403),
  список — `listFilter` → `ownedWhere`.
- Права по userId вне HTTP (политика комнаты, listener) — `AccessService` ядра.
- Своя схема аутентификации — `api-key.scheme.ts` + `asSecurityScheme` + запись в
  `tsoa.json → securityDefinitions`.
- Лимит на маршрут — `@UseGuards(ThrottleGuard(limit, windowMs, "<name>"))` (`auth.controller.ts`).

## Точки расширения для модулей проекта

- Сокет-события — `<feature>.socket-events.ts`:
  `declare module "../socket/socket.types" { interface ISocketEmitEvents {…} }`, экспорт
  из `index.ts`. Augmentation — только на файл-объявление, не на `../socket`.
- Входящее событие с валидацией — `onValidated(socket, event, schema, handler, { rateLimit })`
  (`socket/socket-validation.ts`); `ProfileHandler` с голым `socket.on` — не образец.
- Listener EventBus → сокет — `file/file.listener.ts`, `session/session.listener.ts`.
- Письмо — `declare module "../mailer/mailer.types"` + шаблоны во всех локалях
  `templates/mail/<locale>/<name>{.ejs,.txt.ejs,.subject.ejs}`.
- Конфиг модуля — `<feature>.config.ts` через `defineModuleConfig(section, schema, values)`
  и хелперы схем из `src/config.ts`; переменные — секцией в `.env.example`.
- Связи профиля — `asContactRelation`, `asPresenceAudience` (`profile/profile.relations.ts`).

## Тесты

Скелет юнит-теста и e2e — [testing](testing.md); образец e2e —
`test/e2e/platform.e2e.ts` (области прав: роль без прав → `setPrivileges` → повторный вход).
