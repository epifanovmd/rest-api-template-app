---
name: Code Patterns (эталоны)
description: Где в main смотреть эталон каждого паттерна (модуль, entity, repo, service, controller, dto, задачи, хранилище, права), точки расширения для модулей веток-примеров (socket-events, profile relations, module config, письма, права), скелет теста, проектные gotcha
type: project
---

Правила и принципы — в `CONVENTIONS.md` и `MODULE-CHEATSHEET.md`. Здесь — куда смотреть за
живым примером и что неочевидно. Эталоны — только из main (предметных модулей в нём нет).

## Эталон модуля

Самый актуальный эталон — вывод `yarn gen:module <name>` (`scripts/gen-module.mjs`: errors, пагинация, 201/204,
`UUID`, `@Response`, тесты; печатает шаги — app.module до SocketModule, generate, миграция).

Живой компактный модуль — `src/modules/api-key/`:

| Паттерн                     | Файл                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@Module`                   | `api-key.module.ts` — `entities`, `providers: [Repo, Service, Controller, asSecurityScheme(Scheme)]`                                                                      |
| Entity с индексами/каскадом | `api-key.entity.ts` — `@Index("IDX_API_KEYS_PREFIX", [...], { unique: true })`, `@ManyToOne(() => User, { onDelete: "CASCADE" })`, `timestamptz`                          |
| Repository                  | `api-key.repository.ts` — `findAndCount` для страницы                                                                                                                     |
| Service                     | `api-key.service.ts` — `normalizePagination` + `toPage`, `isUniqueViolation` с повтором, `_eventBus.emit` после записи                                                    |
| Controller                  | `api-key.controller.ts` — `@Route("api/v1/api-keys")`, `@Security("jwt", ["permission:apikey:create"])`, `@ValidateBody`, `@SuccessResponse(201/204)`, `@Path() id: UUID` |
| DTO + body                  | `dto/api-key.dto.ts` — `extends BaseDto`, `static fromEntity`, `ICreateApiKeyBody`                                                                                        |
| Zod-схемы                   | `validation/create-api-key.validate.ts`, `list-api-keys.validate.ts`                                                                                                      |
| События                     | `events/api-key.events.ts`                                                                                                                                                |
| Права                       | `api-key.permissions.ts`                                                                                                                                                  |
| Схема аутентификации        | `api-key.scheme.ts` (`kind: "service"`, scopes ключа в `permissions`) + `tsoa.json → securityDefinitions`                                                                 |

Другие эталоны:

- Транзакция + событие после коммита — `user.service.ts` (регистрация), `email-change.service.ts`,
  `passkeys.service.ts` (`this._dataSource.transaction(async manager => …)`).
- Listener EventBus → socket — `file/file.listener.ts` (`toUser(ownerId, "file:processed", dto)`),
  `session/session.listener.ts`.
- Доменные ошибки — `defineErrors("PREFIX", {...})` в `<module>.errors.ts` (например `file.errors.ts`,
  `user.errors.ts`); в тестах сравнивать `code`, а не текст.
- Пагинация по смещению — `normalizePagination` + `findAndCount` + `toPage` (`api-key`, `file`, `session`, `jobs`).
  Курсорная лента — `audit.repository.ts` (`(createdAt, id)`, `createdAt timestamptz(3)`).
- Socket handler с валидацией — `onValidated(socket, event, ZodSchema, handler, { rateLimit })` из
  `modules/socket/socket-validation.ts` (схема, token bucket на сокет/событие, ack `{ ok: false, error: { code,
message } }`). В main **нет ни одного вызова** (описание — `socket/README.md`, тест — `socket-validation.test.ts`);
  `ProfileHandler` — голый `socket.on` (legacy, для нового кода не образец).
- Комнаты: policy — `jobs/job-room.policy.ts` (`room:subscribe { type: "job" }`); provider-ов в main нет
  (контракт `ISocketRoomProvider` в `socket/socket-rooms.ts`).
- Задачи: служебная очередь с повторами — `mailer/mail-send.job.ts`; `JobError(code, msg, retryable)` —
  `file/file-process.job.ts`, `mailer.service.ts`; cron — `*-cleanup.job.ts` (audit, otp, session, passkeys, file);
  outbox — `file.service.ts::_enqueueProcessing(manager, …)`, `mailer.service.ts` (`{ manager }`); внешняя очередь —
  `jobs/demo-echo.handler.ts` (`asExternalJobHandler`, `job` + `jobType` + `io` + `onComplete`), воркер — `agent/workers/echo`;
  health-индикатор — `jobs/jobs.health.ts` (`asHealthIndicator(JobsHealthIndicator)`). Политик доступа к задачам
  (`asJobAccessPolicy`) в main нет — только владелец/суперпользователь.
- Хранилище: ключи — `file/file-keys.ts` (`files/<id>/original.<ext>`), обработка через `withLocalFile` —
  `file/file-process.job.ts`, прямая загрузка — `file.service.ts` (`signedPutUrl` + complete с условным `UPDATE`).
- Права модуля — `audit/audit.permissions.ts` (`definePermissions("audit", { VIEW: "audit:view" })`).
- E2E-сценарий — `test/e2e/platform.e2e.ts` (файлы S3/local, задачи, биометрия/passkeys), агенты —
  `test/e2e/agents.e2e.ts` (хелпер `test/e2e/agent.ts`: настоящий агент 1.0.0 с воркерами echo/netprobe),
  клиент `test/e2e/client.ts`, письма — Mailpit API.
- Bootstrapper — `src/modules/socket/socket.bootstrap.ts`, `src/modules/user/*bootstrap*` (AdminBootstrap, Seed).
- Guards на маршруте — поиск `@UseGuards(` в `src/modules/auth/`.
- Permission-scope: `@Security("jwt", ["permission:user:update"])` — `src/modules/user/user.controller.ts`; права
  на отдельные действия (не `manage`), объявление с подписями — `user.permissions.ts`.
- Комната списка с правом просмотра — `asSocketRoomPolicy(permissionRoomPolicy(ROOM, Perms.VIEW))` +
  listener, шлющий DTO в комнату (`api-key.module.ts`, `api-key.listener.ts`).
- Права по userId вне HTTP (политика комнаты, listener) — `AccessService` ядра, не кэш в модуле.
- Права «все / свои» на сущность с владельцем — модуль file: `definePermissions` с `scoped: true`,
  `<feature>.access.ts` (`OwnedAccess`), `@Security("jwt", ["permission:<p>:own"])`, сервис `_findFor(actor, id, p)`
  (404/403), список — `listFilter` → репозиторий `findPage({ ownedBy })` через `ownedWhere`; e2e — роль без прав +
  `setPrivileges` + повторный вход (`platform.e2e.ts`, «области прав»). Смена смысла прав — миграция данных.
- Идемпотентная вставка при гонке реплик — `.insert().orIgnore()` (`RoleRepository.grantPermissionsIfMissing`,
  `ensureByName`, `PermissionRepository`, `PrivacySettingsRepository`).
- Нарушение уникальности → 409 — `isUniqueViolation(err)` из `core/db/pg-errors.ts`.
- Атомарный переход состояния — условный `UPDATE … WHERE status IN (…)` + `affected`
  (`FileRepository.transitionStatus`, ротация refresh в `SessionService.rotateRefreshToken`).
- Подпись ссылок файлов — только `FileUrlService` (`src/modules/file/`): `toDtoMap(files)` → `TSignedFiles`,
  `buildWithFiles(entities, collect*Files, Dto.fromEntity)`; DTO с аватарами/вложениями принимают обязательную карту
  `files` и берут ссылки через `signedUrlOf`/`signedFileOf` (`file/signed-files.ts`). Геттеров `File.url`/`toDTO()`
  и `signStorageUrl` нет. Gotcha: `list.map(Dto.fromEntity)` с картой вторым аргументом не компилируется.

## Точки расширения для модулей (с 25.09.2026)

Через них ветки-примеры подключают свои модули, не трогая код main.

1. **Сокет-события.** `socket/socket.types.ts` объявляет только события соединения: клиент → сервер `ping`,
   `auth:refresh`, `room:subscribe`/`room:unsubscribe`; сервер → клиент `pong`, `authenticated`, `auth_error`,
   `auth:expired`, `error`. Модуль объявляет свои в `<feature>.socket-events.ts`:
   `declare module "../socket/socket.types" { interface ISocketEvents {…}; interface ISocketEmitEvents {…} }` и
   экспортирует файл из `index.ts`. Gotcha: augmentation только с модулем-объявлением (`../socket/socket.types`),
   с `../socket` (index) не работает. В main: `auth`, `user`, `profile`, `session`, `file`, `jobs`
   `*.socket-events.ts`.
2. **Связи профиля.** `profile/profile.relations.ts`: токен `CONTACT_RELATION` (`IContactRelation.contactsOf(viewerId,
userIds)` → кто из `userIds` держит viewer в принятых контактах) и `PRESENCE_AUDIENCE`
   (`IPresenceAudience.audience(userId, level)` — кому слать online/offline, `peers(userId)` — чей статус отдать в
   `presence:init`); хелперы `asContactRelation`, `asPresenceAudience`. Потребители — `PrivacySettingsService`,
   `PresenceListener`, `PresenceHandler` (`@multiInject` + `@optional`, результаты объединяются). Без провайдеров:
   `contacts` = только сам, presence — никому.
3. **Конфиг модуля.** `src/config.ts` экспортирует хелперы `positiveInt`, `nonNegativeInt`, `port`, `bool(fallback)`,
   `optionalString`, `csv` и `defineModuleConfig(section, zodSchema, values)` (ошибка → throw «Конфигурация
   модуля «section»: …» при импорте). Настройки модуля — в `<feature>.config.ts` (например `workspace.config.ts`,
   `push.config.ts` в ветках), в `config.ts` их не добавлять. Env модуля — в `.env.example` отдельной секцией.
4. **Письма.** `IMailTemplateData` (`mailer/mailer.types.ts`) дополняется модулем
   (`declare module "../mailer/mailer.types" { interface IMailTemplateData { "name": {...} } }`), файлы шаблона —
   во всех локалях `templates/mail/<locale>/<name>{.ejs,.txt.ejs,.subject.ejs}`. `MAIL_TEMPLATE_NAMES` удалён: тест
   полноты (`mail-renderer.test.ts`) берёт имена из `*.subject.ejs` и требует одинаковые наборы в ru/en.
5. **Права.** Справочник `permission.types.ts` содержит только базовые (`*`, user, role, profile, apikey, audit);
   модуль объявляет свои `definePermissions` в `<feature>.permissions.ts` и экспортирует из `index.ts`
   (регистрация — при импорте); засев ролей берёт `getRegisteredPermissions()`. Действие над своими сущностями —
   `scoped: true` (появляется `<p>:own`); базовые права ролей — `ROLE_DEFAULT_PERMISSIONS` (литералами) или
   миграция данных для существующих баз.
6. Остальные реестры (`asSocketListener/Handler`, `asSocketRoomProvider/Policy`, `asJobHandler`,
   `asJobAccessPolicy`, `asSecurityScheme`, `asHealthIndicator`, `FILE_USAGE_PROBE`, `ROUTE_PROVIDER`) —
   project_architecture.md «Реестры расширения».

## Скелет теста сервиса

```ts
import "reflect-metadata";
import { expect } from "chai";
import sinon from "sinon";
import {
  createMockRepository,
  createMockEventBus,
  uuid,
} from "../../test/helpers";

describe("FeatureService", () => {
  let service: FeatureService;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  const mockDataSource = {
    transaction: sinon
      .stub()
      .callsFake((cb: any) =>
        cb({ getRepository: sinon.stub().returns(createMockRepository()) }),
      ),
  } as any;

  beforeEach(() => {
    mockRepo = createMockRepository();
    mockEventBus = createMockEventBus();
    service = new FeatureService(
      mockRepo as any,
      mockEventBus as any,
      mockDataSource,
    );
  });
});
```

Двойники транзакций — `createMockEntityManager` / `createMockDataSource` в `src/test/helpers.ts`.

## Проектные gotcha

- `Roles` (`src/modules/role/role.types.ts`) и `Permissions` (`src/modules/permission/permission.types.ts`) —
  const-объекты модулей; `TRole`/`TPermission = Known… | (string & {})` — только в модулях role/permission.
  В ядре роли и права — `string[]`, известны лишь `SUPERUSER_ROLE`/`ALL_PERMISSIONS`.
- `TRole`/`TPermission` (`string & {}`) — только для кода; в DTO запросов — `RoleName`/`PermissionName`
  (tsoa кодирует `string & {}` как невыполнимую схему, любой запрос отклоняется). Ловит `src/routing/spec.test.ts`.
- Новый модуль — в блок «Модули проекта» `app.module.ts`, **до SocketModule**.
- Каждый модуль имеет свой `README.md` — обновлять при изменении модуля.
- Глубокие импорты чужих модулей остались в сущностях и user/auth (`../user/user.entity`, `../role/role.entity`,
  `../session/session.dto`) — legacy, для нового кода — через `index.ts` (исключение — `declare module` на
  файл-объявление).
- `@Path()` с uuid — тип `UUID` (`core/http/uuid.type.ts`): tsoa отклоняет до контроллера → 400 `VALIDATION_ERROR`.
- void-эндпоинты — `@SuccessResponse(204)`, создание — 201.
- `ICreateXBody`-интерфейсы лежат в `dto/` (не в контроллере) и экспортируются из `dto/index.ts`.
- Тела запросов в контроллере — `@Body() body: IXBody`; tsoa валидирует типы, Zod — форму/длины; оба → 400
  `VALIDATION_ERROR`.
- tsoa читает JSDoc над методом контроллера → OpenAPI description/summary.
- Все функции — стрелочные (`func-style: expression` в `eslint.config.mjs`); хелперы в `error.middleware.ts`
  специально объявлены выше `errorMiddleware`.
- Периодические задачи — только `cron` в `definition`; `setInterval` в коде остался только для инфраструктуры
  процесса (health-monitor БД, heartbeat presence, продление аренды задачи, опрос отмен).
- Новый эндпоинт без e2e-вызова роняет `test/e2e/zz-coverage.e2e.ts`.
- `z.string().uuid()` (zod 4) не принимает `00000000-…-0001` (`uuid()` из test/helpers) — в тестах сокет-схем
  нужны v4-подобные id (`11111111-1111-4111-8111-111111111111`).
- `ValidateQuery` подменяет query результатом парсинга — `offset`/`limit`/`cursor` обязаны быть в схеме.
- Новая схема аутентификации — и `asSecurityScheme`, и запись в `tsoa.json → securityDefinitions`; схема без
  регистрации в реестре → 500 на маршруте.
- Изменение схемы БД — только новой миграцией; базовую `InitialSchema` не пересоздавать (на неё опираются ветки).

## События безопасности — с ожиданием

Смена и сброс пароля, смена прав, удаление пользователя публикуются через
`await eventBus.emitAsync(...)`, а не `emit`: слушатели отзывают сессии и токены, и к моменту
ответа старые сессии уже недействительны (иначе гонка — e2e «смена пароля» падал ~1 из 5).
Остальные события — `emit` (не блокируют ответ).

## Задачи: запрос-ответ, внешние задачи агентов

- `JobQueue.request(queue, data, { timeoutMs, priority })` — синхронный вызов исполнителя из HTTP-запроса:
  видимая задача + ожидание итога (`JobResultWaiter`: сигнал `job_settled` из транзакции завершения,
  опрос 5 с / 1 с без LISTEN). Ошибка → 502 `JOB_REQUEST_FAILED` (`details.code`), таймаут → 504
  `JOB_REQUEST_TIMEOUT` и задача снимается. `manager` передать нельзя (ждать чужого коммита некому).
- Внешние задачи (с 09.10.2026 — стандарт `/jobs` SDK): core-токен `EXTERNAL_JOB_EXECUTOR`
  (`IExternalJobExecutor`: canDispatch/dispatch → `ExternalJobUpdate`/poll/cancel/onUpdate/onReconnect), реализация —
  `AgentJobExecutor` (agent). Jobs не импортирует agent. `definition.job: { type, worker? }` (обязателен, иначе
  ошибка регистрации), хуки `jobType?(info)`, `io?(info)` (ключи FileStorage → подписанные GET/PUT, ttl ≥
  expireInSeconds), `onComplete(ctx{outputs})`, `onFail`. Штатной остановки нет (`JobQueue.stop`, `POST /jobs/{id}/stop`,
  `stopRequested` удалены миграцией `NodeAgentName1791600000000`).
- Старт без опроса pg-boss: `enqueue` внешней без `startAfter` → `startAfter: 10 с` у pg-boss + `NOTIFY job_queued`
  в транзакции (outbox — дойдёт после коммита) → `JobsBootstrap` в процессах с `canDispatch` → `startNow`.
  Захват записи — `claimDispatch` (status queued, external_id NULL, started_at NULL или старше 90 с → ставит
  started_at; статус остаётся queued), неудача — `releaseDispatch` (started_at NULL, error). pg-boss `dispatch`
  — тот же захват; захвачено другим → `JOB_DISPATCHING` (retry). Reconnect агента → `reconcile` + `startQueued`.
- `AgentJobExecutor.dispatch`: агенты online, воркер running с типом в `workerManifest().jobs` (supports не умеет
  jobs), без relay — только local; `runJob(..., { jobId: run.id, timeoutMs: 1 })` — 200 → `done` (workId = run.id),
  202 → `progress` (workId = id воркера). JOB_REJECTED: 408/409/429/5xx — retry, иначе final; JOB_INVALID — final.
  События `job.*` (JOB_EVENTS) → `ExternalJobService.apply`. Логгер редактирует ключ `code` — писать `errorCode`.
- S3 (SeaweedFS) presigned PUT: `content-type` должен быть подписан и совпадать (без ContentType — 403) →
  выходам задавать `contentType`, воркер шлёт ровно его (echo — `text/plain`).

## Файлы: владение, создание сервером, сборка мусора

- `files.owner_id` → users `ON DELETE SET NULL` (миграция `FileOwnerSetNull`). `ownerId = null` — файл отдан
  домену (`FileService.adopt`) или владелец удалён.
- Пробы использования пакетные: `IFileUsageProbe.filesInUse(ids)`, регистрация `asFileUsageProbe(Cls)`;
  сводка — `FileUsageChecker`. В main — `ProfileAvatarUsageProbe`.
- Сервер создаёт файлы сам: `createFromLocal` (распаковка), `registerStored` + `reserveFileKey` (выход воркера).
- Удаление домена — `scheduleRemoval(ids, manager)` → `file.remove`; каскадные потери — cron `file.gc`
  (бесхозные старше часа без ссылок).
- Белый список загрузок расширяется модулем: `defineUploadRules`; `signatures: "binary"` — формат без
  сигнатуры (веса моделей).

## Очереди: пределы

- `JobHandlerRegistry.register` отклоняет `expireInSeconds > 86400` (предел pg-boss — иначе падение при старте) и
  `leaseSeconds > expireInSeconds` у внешней очереди.
- `bigintNumber` — `core/db/transformers.ts` (колонки `bigint` → number).

### Агенты и задачи: файлы итога, своим лично, пересылка

- Файлы итога внешней задачи: при `done` выходы `io(job).outputs`, которые есть в хранилище
  (`storage.stat`), пишутся в `job_runs.outputs` `[{name,key,size}]`; ссылки (`GET`, срок
  `STORAGE_SIGNED_URL_TTL_SECONDS`) подписывает `JobRunViews` при каждой выдаче
  (`JobsService`, `JobRunTracker.publish` — для записи с `outputs` событие уходит после подписи).
  `job_runs.job_type` (+ `worker` очереди) пишется `setTarget` до `executor.dispatch`.
- `node:mesh` своим — `NodeMeshService.byOwner(mesh)` + `OwnedEntityEmitter.toOwners`; нагрузка
  — `node:load {nodeId, agentId, point:{at, host}}` из `AgentMetricsReceivedEvent` (не чаще
  `NODE_LOAD_EMIT_MS` на агента; при watch метрики идут раз в секунду).
- Пересылка — отдельный `AgentRelayServer` (`AGENT_RELAY_PORT`/`HOST`), `instanceId` с секретом —
  адрес сервера пересылки, без секрета — адрес API. В e2e у каждой копии свой порт пересылки
  (`RELAY_URL`, `peer.relayUrl`). Миграционный тест `node.repository.integration` откатывает
  последние миграции по порядку — новая миграция добавляет туда шаг.
