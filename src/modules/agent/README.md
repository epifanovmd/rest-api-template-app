# Модуль Agent

Агенты на узлах и их воркеры. Связь с агентами (регистрация, WebSocket, подтверждения и
повторы), запросы к воркерам, настройки воркеров, наблюдение, встроенные действия, выпуск и
установку ведёт `Agents` из `agent-sdk/server` (агент и SDK —
[github.com/epifanovmd/agent](https://github.com/epifanovmd/agent), формат —
[sdk/spec/README.md](https://github.com/epifanovmd/agent/blob/main/sdk/spec/README.md)).
Модуль даёт SDK хранилище на Postgres, регистрацию по токенам из БД, связь между процессами
API, историю (события воркеров, метрики), REST, события Socket.IO, аудит и исполнителя
внешних очередей модуля задач.

```
бэкенд (Agents) ──WebSocket──► агент ──HTTP по unix-сокету──► воркер (без SDK)
```

Соединение открывает только агент. Воркер — обычный HTTP-сервис на любом языке; агент
запускает воркеры из своих настроек (`agent.yaml`) и ничего не знает об их работе: он
передаёт запросы, настройки, события и метрики, не разбирая их.

## Структура файлов

```
src/modules/agent/
├── agent.module.ts             # @Module: сущности, провайдеры, токены расширения, AgentBootstrap
├── agent.runtime.ts            # AgentRuntime: Agents процесса, onEvent, события SDK → EventBus, сигналы
├── agent.bootstrap.ts          # старт: события, LISTEN; на ролях с HTTP — WebSocket и наблюдение
├── agent.signals.ts            # AgentSignals (PgSignals): канал agents_changed
├── agent-link.handler.ts       # RAW_HTTP_HANDLER: /api/v1/agent-link/* → agents.handle
├── agent-relay.server.ts       # внутренний HTTP-сервер пересылки (AGENT_RELAY_PORT): POST /internal/agent-relay → handleRelay
├── store/agent.store.ts        # AgentStore implements Store (Postgres): агенты и настройки
├── store/stored-agent*.entity.ts
├── agent-history.service.ts    # события воркеров и точки метрик: запись, лента, история, уборка
├── agent-worker-event.* / agent-metric.*   # сущности и репозитории истории
├── agent-enrollment.service.ts # токены регистрации + хук enroll, контекст регистрации
├── agent-enrollment-token.*    # сущность и репозиторий токенов
├── agent-access.service.ts     # доступ: право модуля или политики AGENT_ACCESS_POLICY
├── agent.service.ts            # агенты: список, карточка, проблемы, отзыв, удаление, ключ, обновление, журнал, выпуск
├── agent-worker.service.ts     # воркеры: перезапуск, обновление, настройки, запрос к воркеру
├── agent-job.executor.ts       # EXTERNAL_JOB_EXECUTOR: внешние очереди модуля задач → воркеры
├── *.controller.ts             # REST (ниже)
├── agent-watch.service.ts      # watch, пока сокет в комнате agent_<id>
├── agent.handler.ts            # сокет: agent:log-level
├── agent.listener.ts           # EventBus → комнаты agents / agent_<id>
├── agent-room.policy.ts        # комната agent_<id>
├── agent-prune.job.ts          # cron agents.prune
├── agent.socket-events.ts      # контракт сокета
├── agent.config.ts / .errors.ts / .permissions.ts / .types.ts
├── dto/ events/ validation/
└── *.test.ts                   # юнит; store/agent.store.integration.test.ts — с Postgres
```

## Хранилище SDK (`AgentStore`)

`Store` SDK — 8 методов: агенты (`createAgent`, `getAgent`, `listAgents`, `updateAgent`,
`deleteAgent`) и настройки воркеров (`setConfig`, `listConfigs`, `deleteConfig`).

| Таблица         | Что                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `agents`        | `AgentRecord` целиком в `record` (хеш ключа, учёт потока, последние `hello`, `status`, метрики, проблемы), `rev` |
| `agent_configs` | строка на ключ «агент, воркер, ключ»: версия, значение (`jsonb`), время, автор                                   |

- **Условная запись агента:** `UPDATE … WHERE id = … AND rev = …` одним запросом; не
  совпало — `false`, SDK перечитывает и повторяет. Несколько процессов не затирают
  изменения друг друга.
- **Версия настройки только растёт:** `INSERT … ON CONFLICT DO UPDATE SET version =
GREATEST(version + 1, minVersion)` — одновременные записи получают разные версии; после
  удаления строка остаётся с `data = NULL` (счётчик), значение `null` — это `'null'::jsonb`.
- Строки с `\u0000` очищаются перед записью (Postgres не принимает их в `jsonb`).
- Id агента — 32 шестнадцатеричных символа (выдаёт SDK); в пути — тип `TAgentId`.

## История (вне SDK)

SDK историю не хранит: она приходит событиями и пишется модулем.

| Таблица         | Что и когда                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_events`  | события воркеров: в `onEvent` SDK (подтверждение агенту — после записи); ключ «агент, id сообщения» отсекает повтор доставки                       |
| `agent_metrics` | точки метрик (`host` — узел, `workers` — ответы `GET /metrics` воркеров) из события `metrics`, не чаще `AGENT_METRICS_STORE_INTERVAL_MS` на агента |

Срок хранения — `AGENT_EVENTS_RETENTION_DAYS`, `AGENT_METRICS_RETENTION_HOURS`; уборка —
cron `agents.prune` (раз в час). Итоги действий и «кто что сделал» — в журнал аудита
проекта (`audit_events`): `agent.action` (событие `audit` SDK: `config.set`, `fetch`,
`worker.restart`, `agent.revoke`, …) и `agent.action-result` (событие `action`: статус,
ошибка).

## Связь и регистрация

- `/api/v1/agent-link/*` (регистрация, выпуск, `install.sh`) — `RAW_HTTP_HANDLER`: до
  разбора тела, CORS и лимита запросов; в Swagger не входят. WebSocket того же пути —
  `agents.attach(HttpServer)` на ролях `api` и `all`.
- Регистрация: общий токен окружения `AGENT_BOOTSTRAP_TOKEN` или выпущенный токен
  (`<prefix>.<secret>`, в БД — префикс и хеш; срок, отзыв, лимит использований). Метки
  токена сильнее меток агента. Новый агент — событие `AgentEnrolledEvent` с источником
  (токен, кто выпустил, метки): по метке `nodeId` модуль узлов привязывает агента к узлу.
- `onEvent`: обработчики модулей (ход внешних задач, события `job.*`) → запись в
  `agent_events` → событие `AgentEventReceivedEvent` → подтверждение агенту. Ошибка — без
  подтверждения: агент пришлёт событие снова с тем же id.
- Связь: ping SDK раз в 5 с; агент после обрыва остаётся `online` ещё
  `AGENT_OFFLINE_GRACE_MS` (3 с) — остановленный агент виден `online: false` в сокете
  (`agent:updated`) через ~3 с, пропавшая сеть — через 13–18 с. Своих задержек поверх SDK
  модуль не держит.

## Несколько процессов

Store общий; соединение агента живёт в одном процессе (`agent.session.instance` —
`instanceId` процесса: с пересылкой — внутренний адрес его сервера пересылки
`http://host:port` — `INSTANCE_URL`, иначе `AGENT_RELAY_HOST` (для `0.0.0.0` — IPv4
машины или контейнера) и `AGENT_RELAY_PORT`; без пересылки — адрес API `SERVER_HOST` и
`SERVER_PORT`; у роли `worker` — имя без адреса).

- **Изменения в Store** (настройки, отзыв, удаление) — событие SDK `change` → NOTIFY
  `agents_changed` → остальные процессы вызывают `agents.refresh(agentId)`: процесс с
  соединением досылает настройки или закрывает соединение.
- **Пересылка (relay)** — при общем секрете копий `AGENT_RELAY_SECRET`: вызов, которому
  нужно соединение (`fetch`, задачи `runJob`/`jobStatus`/`cancelJob`, перезапуск и
  обновление воркера, обновление агента, смена ключа, журнал, `watch`), SDK из любого
  процесса пересылает в процесс с соединением — `POST <instanceId>/internal/agent-relay`
  с заголовком `x-agents-relay-secret`; тот выполняет вызов (`agents.handleRelay`) и
  отвечает (у `fetch` — потоком). Маршрут обслуживает только внутренний сервер
  пересылки (`AgentRelayServer`) — отдельный порт `AGENT_RELAY_PORT` (8182) на
  внутреннем адресе `AGENT_RELAY_HOST` (по умолчанию `127.0.0.1`, в контейнере —
  `0.0.0.0`); публичный порт API его не знает (404), без секрета — 401, другие пути — 404. Порт пересылки наружу не публикуют. Пользователю `AGENT_ELSEWHERE` не приходит;
  процесс с соединением недоступен — 502 `RELAY_FAILED`. Сервер пересылки поднимается
  только с секретом и на ролях с HTTP (`api`, `all`).
- **Без секрета** пересылки нет: такой вызов в другом процессе — **503
  `AGENT_ELSEWHERE`** с `Retry-After: 2` (одна копия API или «липкий» балансировщик).
- **Наблюдение (`watch`)** — из процесса, где сокет в комнате агента; продлевается каждые
  20 с, поэтому после переподключения агента к другому процессу доходит и туда.
- Роль `worker` соединений не держит: читает записи агентов и пишет настройки через Store;
  с пересылкой передаёт и внешние задачи.
- Dev: две копии на одной машине — разные `SERVER_PORT` и `AGENT_RELAY_PORT`, общий
  `AGENT_RELAY_SECRET`. Docker Compose: реплики `api` — один секрет в `.env.production`,
  `AGENT_RELAY_HOST=0.0.0.0`, порт 8182 только в сети compose, адрес — IP контейнера.

## Права (`AgentPermissions`, группа «Агенты»)

| Право          | Что                                                                               |
| -------------- | --------------------------------------------------------------------------------- |
| `agent:view`   | агенты, воркеры, настройки (чтение), события, метрики, проблемы, выпуск           |
| `agent:manage` | отзыв, удаление, смена ключа, обновление агента, перезапуск и обновление воркеров |
| `agent:config` | запись и удаление настроек воркеров                                               |
| `agent:fetch`  | запросы к воркерам                                                                |
| `agent:logs`   | журнал агента и воркеров с узла                                                   |
| `agent:enroll` | токены регистрации, команда установки                                             |

Маршруты агентов — `@Security("jwt")`: доступ проверяет `AgentAccessService` — право
модуля (все агенты) или политика `AGENT_ACCESS_POLICY` (модуль узлов: агент своего узла с
`node:view`, `node:logs`, `node:agent`). Невидимый агент — 404, видимый без права — 403.
Отзыв и удаление — только с `agent:manage`.

## REST (jwt, под `/api/v1`)

| Метод и путь                                          | operationId                        | Право / доступ               |
| ----------------------------------------------------- | ---------------------------------- | ---------------------------- |
| `GET /agents`                                         | `GetAgents`                        | view (область)               |
| `GET /agents/alerts?agentId`                          | `GetAgentAlerts`                   | view                         |
| `GET /agents/events?agentId&worker&type&cursor&limit` | `GetAgentEvents`                   | view (лента, курсор)         |
| `GET /agents/{id}`                                    | `GetAgent`                         | view                         |
| `POST /agents/{id}/revoke`                            | `RevokeAgent`                      | `agent:manage`               |
| `DELETE /agents/{id}`                                 | `DeleteAgent` (204)                | `agent:manage`               |
| `POST /agents/{id}/rotate-key`                        | `RotateAgentKey` (204)             | manage                       |
| `POST /agents/{id}/update`                            | `UpdateAgent`                      | manage                       |
| `GET /agents/{id}/logs?worker&lines`                  | `GetAgentLogs`                     | logs                         |
| `GET /agents/{id}/metrics?since&until&limit`          | `GetAgentMetrics`                  | view                         |
| `POST /agents/{id}/workers/{worker}/restart {force}`  | `RestartAgentWorker`               | manage                       |
| `POST /agents/{id}/workers/{worker}/update {force}`   | `UpdateAgentWorker`                | manage                       |
| `POST /agents/{id}/workers/{worker}/fetch`            | `FetchAgentWorker` (поток)         | fetch                        |
| `GET /agents/{id}/configs?worker`                     | `GetAgentConfigs`                  | view                         |
| `GET /agents/{id}/workers/{worker}/configs/{key}`     | `GetAgentWorkerConfig`             | view                         |
| `PUT /agents/{id}/workers/{worker}/configs/{key}`     | `SetAgentWorkerConfig`             | config                       |
| `DELETE /agents/{id}/workers/{worker}/configs/{key}`  | `DeleteAgentWorkerConfig` (204)    | config                       |
| `GET /agent-releases`                                 | `GetAgentRelease`                  | view (кандидаты — в области) |
| `POST /agent-releases/install-command`                | `CreateAgentInstallCommand`        | `agent:enroll`               |
| `POST /agent-enrollment-tokens`                       | `CreateAgentEnrollmentToken` (201) | `agent:enroll`               |
| `GET /agent-enrollment-tokens`                        | `GetAgentEnrollmentTokens`         | `agent:enroll`               |
| `POST /agent-enrollment-tokens/{id}/revoke`           | `RevokeAgentEnrollmentToken` (204) | `agent:enroll`               |

- **Карточка агента:** связь, узел, версия, воркеры из `hello` и `status` — `state`
  (`running` — зарегистрирован; `invalid` — не ответил как нужно на `GET /health` или
  `GET /manifest`, причина в `message`), `health` (`ok`, `busy`, `message`, `info`),
  `pending` (замена ждёт, пока воркер занят), `manifest` (ключи настроек со схемой, маршруты,
  события, типы задач `jobs`), `configs` (что на диске агента и итог применения); последняя
  точка метрик, проблемы, процесс с соединением.
- **Настройки:** `PUT` проверяет значение по `schema` ключа из манифеста воркера
  (`validateConfigs`; не подходит — 400 `AGENT_CONFIG_INVALID`), даёт новую версию; агент на
  связи получает её сразу, иначе — при подключении. Статус — `pending | applying | applied |
failed | deleting` (`delivered`, `applied`, `error`); агент удалил ключ — событие сокета
  `agent:config` с `state: deleted` (`version: null`).
- **Запрос к воркеру:** тело `{ method?, path, headers?, body?, encoding?: utf8 | base64,
timeoutMs? }` (тело — до 4 МБ, срок — до 10 мин); ответ — статус, заголовки и тело воркера
  потоком и заголовок `X-Agent-Worker-Status` (статус воркера): ответ воркера с ошибкой
  отличается от ошибки API (тело `{ code, message }`, заголовка нет). Клиент ушёл — запрос к
  воркеру отменяется. Служебные пути воркера — 403 `PATH_FORBIDDEN`; ошибка до ответа
  воркера — код агента (`WORKER_UNAVAILABLE` 502, `WORKER_INVALID` 502, `TIMEOUT` 504, …).
  В аудит (`agent.action`, `fetch`) — только изменяющие методы `POST`, `PUT`, `PATCH`,
  `DELETE`.
- **Перезапуск и обновление воркера:** ответ — `{ deferred, pending?, actionId?, version?,
previous? }`. Свободный воркер заменяется сразу (`deferred: false`, у обновления —
  версии). Занятый (`health.busy`) — ответ сразу `{ deferred: true, pending, actionId }`,
  замена — после окончания работы, её итог — событие сокета `agent:action` (`id =
actionId`, `deferred: true`); `force: true` — заменить сразу. Обновление — только воркер
  из выпуска (`release: true`), иначе 409 `AGENT_WORKER_NOT_RELEASED`.
- **Ошибки SDK** → `AGENT_*` (`NOT_FOUND`, `REVOKED`, `OFFLINE` 503, `ELSEWHERE` 503 — только
  без пересылки, `CONFIG_INVALID`, `UPDATE_NOT_AVAILABLE`, `TIMEOUT`, …); коды агента и SDK
  (`RELAY_FAILED` 502, `JOB_*`, …) — как есть со статусом SDK.

## Socket.IO

| Комната      | Кто входит                                           | События                                                                        |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `agents`     | `room:subscribe { type: "agents" }`, `agent:view`    | `agent:updated`, `agent:deleted`, `agent:alert`, `agent:event`                 |
| `agent_<id>` | `{ type: "agent", id }`: доступ к агенту на просмотр | то же по агенту + `agent:metrics`, `agent:log`, `agent:config`, `agent:action` |

Пока сокет в комнате агента, сервер держит наблюдателя `watch`: метрики раз в секунду,
журнал с уровня клиента (`agent:log-level { agentId, level }`, по умолчанию `info`).
Выход из комнаты или отключение снимают наблюдателя.

## Внешние очереди: задачи на воркерах

`AgentJobExecutor` — исполнитель внешних очередей модуля задач (`definition.external`) по
стандарту задач агента (`/jobs`, SDK `runJob`, `jobStatus`, `cancelJob`):

1. **Кому.** Очередь называет тип задачи воркера (`definition.job.type`, обработчик может
   выбрать тип на задачу — `jobType`) и, если нужно, воркер (`job.worker`). Подходит агент
   на связи, чей воркер в `running` объявил тип в `manifest.jobs`; свободные (`busy:
false`) — первыми. С пересылкой — агент любого процесса, без неё — только этого
   (у другого — повтор `AGENT_ELSEWHERE`); подходящих нет — повтор `NO_AGENT`.
2. **Когда.** Сразу после постановки: сигнал `job_queued` в транзакции постановки (и
   outbox-транзакции — дойдёт после коммита) → процесс берёт запись условным UPDATE и
   передаёт задачу без ожидания опроса pg-boss. Задача pg-boss начинается через 10 с — для
   повторов передачи (`retryLimit`, `retryDelaySeconds`) и ожидания агента; подключился
   агент — ждущие задачи передаются сразу.
3. **Как.** `runJob(agentId, worker, { type, jobId: <id задачи>, data, files })` → `POST
/jobs`. Быстрая задача — `200 { result }`: итог сразу, без событий (хук `onComplete`).
   Долгая — `202 { id }`: запись связывается с задачей воркера (`agentId`, `worker`,
   `externalId`, срок `deadlineAt`), ход и итог — события `job.progress { progress,
message }`, `job.done { result }`, `job.failed { error }`, `job.cancelled` (в `onEvent`,
   до подтверждения агенту). Отказ воркера: `400` и неверные `data` (`JOB_INVALID`,
   `validateJobs`) — провал без повторов; занят (`409`), сбой, связь — повтор.
4. **Файлы.** Хук `io(job)` возвращает ключи хранилища: `inputs` → подписанные `GET`,
   `outputs` → подписанные `PUT` (срок ссылок — не меньше срока задачи; `contentType`
   входит в подпись — воркер загружает файл ровно с этим `Content-Type`). Воркер получает
   `files: { inputs: { имя: url }, outputs: { имя: url } }` и сам качает и загружает
   файлы; ключи выходов — в `ctx.outputs` хука `onComplete`. Загруженные выходы —
   в записи задачи; клиенту — `outputs: [{ name, url, size?, expiresAt }]` (ссылки на
   скачивание). Тип задачи воркера и воркер — `jobType`, `worker` записи.
5. **Сверка, отмена, срок.** После подключения агента и перезапуска воркера —
   `jobStatus` (`GET /jobs/{id}`); воркер не знает задачу — провал `EXTERNAL_JOB_LOST`.
   Отмена — `cancelJob` (`POST /jobs/{id}/cancel`) из любого процесса; срок истёк —
   `JOB_TIMEOUT` и отмена у воркера.

## Своя очередь задач и воркер

1. **Обработчик очереди в модуле-владельце** — только хуки, работу делает воркер:

   ```ts
   @Injectable()
   export class ReportRenderJob implements IExternalJobHandler<
     { reportId: string },
     { pages: number }
   > {
     readonly definition = {
       queue: "report.render",
       external: true as const,
       job: { type: "report.render", worker: "report" }, // тип в manifest.jobs воркера
       retryLimit: 3, // повторы передачи (нет агента, воркер недоступен)
       expireInSeconds: 3600, // срок всей работы у воркера
     };

     io(job: ExternalJobInfo<{ reportId: string }>): ExternalJobFiles {
       return {
         outputs: {
           pdf: {
             key: `reports/${job.data.reportId}.pdf`,
             contentType: "application/pdf",
           },
         },
       };
     }

     async onComplete(
       ctx: ExternalJobContext<{ reportId: string }>,
       result: { pages: number },
     ) {
       // ctx.manager — транзакция завершения задачи, ctx.outputs.pdf — ключ файла
       await ctx.manager.update(
         Report,
         { id: ctx.data.reportId },
         { pages: result.pages, fileKey: ctx.outputs.pdf },
       );
     }
   }
   // @Module({ providers: [asExternalJobHandler(ReportRenderJob)] })
   ```

   Постановка — как у любой задачи: `jobQueue.enqueue("report.render", { reportId },
{ manager, ownerId, title })`; ждать итог из запроса — `jobQueue.request(...)`.

2. **Воркер** — каталог `agent/workers/<имя>` (HTTP-сервис на unix-сокете
   `AGENT_WORKER_SOCKET` на любом языке, без SDK; запуск — исполняемый `run`, версия —
   файл `VERSION`), как его упаковать и доставить на узлы — [agent/README.md](../../../agent/README.md):

   - обязательно `GET /health` → `{ ok, busy?, message?, info? }` (`busy: true`, пока идёт
     долгая задача: агент не заменяет воркер до её окончания) и `GET /manifest` → `{
version, configs?, routes?, events?, jobs? }`: без них агент не регистрирует воркер;
   - задачи: тип — в `manifest.jobs`; `POST /jobs { type, jobId, data, files }` → `200 {
result }` или `202 { id }` (повтор с тем же `jobId` — та же задача), `GET /jobs/{id}`,
     `POST /jobs/{id}/cancel`; события `job.*` в `events` не объявляются;
   - события — `POST /events { type, data }` на сокете агента `AGENT_SOCKET` с
     `Authorization: Bearer $AGENT_WORKER_TOKEN`; агент хранит их на диске до
     подтверждения сервера;
   - настройки — `PUT /config/{key} { version, data }` (ключ — в `manifest.configs` со
     схемой значения), `DELETE /config/{key}`; метрики — `GET /metrics` (любой JSON);
     уборка при удалении агента — `POST /cleanup`;
   - ход долгой задачи — на диск: перезапущенный воркер продолжает её.

   Образец — `agent/workers/echo` (Python, только стандартная библиотека).

3. **Агенту — воркер в настройках** (`agent.yaml`, раздел `workers`): на узле его
   прописывает `agent install --worker <имя>` (воркер из выпуска, `release: true`); локально —
   `agent/local/agent.yaml`, в образе — `agent/docker/agent.yaml`.

## Демо-воркер `echo`

`agent/workers/echo` (Python ≥ 3.10, без зависимостей): задачи `echo.quick` (итог сразу) и
`echo.long` (шаги с `job.progress`, итог `job.done`, `fail` — `job.failed`, отмена —
`job.cancelled`; `files.inputs.source` — текст из файла, `files.outputs.result` — итог в
файл) очереди `demo.echo` (`POST /api/v1/jobs/demo/echo`, право `jobs:demo`: `{ text, long?,
steps?, delayMs?, fail?, withOutput? }` → итог `{ text, output? }` по настройке `settings` —
префикс и регистр); `POST /echo`, `GET /stream`, `GET /bytes`, `POST /hang`, метрики,
`POST /cleanup`. Ход долгих задач — в `ECHO_JOBS_DIR`.

```bash
yarn dev               # API (AGENT_BOOTSTRAP_TOKEN в .env.development)
yarn agent:release     # выпуск для узлов agent/release (AGENT_RELEASES_DIR=agent/release)
yarn agent             # агент 1.0.0 с воркерами echo и netprobe (agent/local/agent.yaml)
```

Подробно про локальный запуск, выпуск и установку на узлы — [agent/README.md](../../../agent/README.md).

## Конфигурация

`AGENT_BOOTSTRAP_TOKEN`, `AGENT_STATUS_INTERVAL_MS` (15000), `AGENT_METRICS_INTERVAL_MS`
(15000), `AGENT_METRICS_STORE_INTERVAL_MS` (60000), `AGENT_METRICS_RETENTION_HOURS` (168),
`AGENT_EVENTS_RETENTION_DAYS` (14), `AGENT_OFFLINE_GRACE_MS` (3000), `AGENT_RELAY_SECRET`
(пересылка между копиями), `AGENT_RELAY_PORT` (8182) и `AGENT_RELAY_HOST` (`127.0.0.1`) —
внутренний сервер пересылки, `INSTANCE_URL` (адрес сервера пересылки копии), `AGENT_RELEASES_DIR`,
`AGENT_PUBLIC_KEY`, `AGENT_PUBLIC_URL`; `TRUST_PROXY` — адрес агента за прокси.

## Тесты

Юнит: доступ, регистрация, ошибки, история, исполнитель внешних очередей. Хранилище и
история на Postgres —
`TEST_DATABASE_URL=postgres://…/<тестовая база> yarn test:file src/modules/agent/store/agent.store.integration.test.ts`.
E2E — `test/e2e/agents.e2e.ts` с настоящим агентом 1.0.0 и воркером echo (хелпер
`test/e2e/agent.ts`; программа агента — `agent/release`, `yarn agent:release`): задачи
быстрые и долгие (`jobType`), файл итога — ссылка на скачивание, отмена, пересылка через
вторую копию API (внутренний порт пересылки; публичный — 404), отложенная замена,
`online: false` за ~3 с.
