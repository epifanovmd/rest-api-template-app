# Модуль Jobs

Очередь задач на pg-boss 12 (Postgres): реализация `JobQueue` из ядра
(`src/core/jobs`). Задачи переживают рестарт, повторяются по политике очереди,
выполняются на процессах `APP_ROLE=worker|all`; cron-задачи выполняет ровно
один процесс кластера. Поверх pg-boss — видимые задачи (`job_runs`: статус,
прогресс, лог, отмена между процессами, события по сокету) и внешние задачи,
которые выполняет исполнитель `EXTERNAL_JOB_EXECUTOR` — агенты и их воркеры (модуль `agent`).

## Структура файлов

```
src/modules/jobs/
├── jobs.module.ts            # @Module: провайдеры, JobQueue → PgBossJobQueue, бутстрапер
├── pg-boss.service.ts        # Экземпляр pg-boss: свой пул и схема, ready(), findJob, failFinal
├── pg-boss-job.queue.ts      # JobQueue: enqueue (outbox через manager, сигнал job_queued), request, cancel
├── jobs.bootstrap.ts         # Запуск: start → createQueue → (worker) work + schedule; graceful stop
├── job-handler.registry.ts   # Обработчики из JOB_HANDLER по очереди, умолчания definition
├── job.runner.ts             # Выполнение Node-задачи: контекст, requestId, повторы, метрики
├── job-progress.writer.ts    # Троттлинг ctx.progress/ctx.log (≤ 2 записи/с)
├── job-signals.ts            # LISTEN/NOTIFY: job_cancel, job_settled — одно соединение
├── job-cancel.watcher.ts     # Отмена между процессами: сигнал job_cancel / опрос раз в 2 с
├── job-result.waiter.ts      # Ожидание итога задачи (request): сигнал job_settled + опрос
├── job-lease.reaper.ts       # Возврат задач с истёкшей арендой
├── lease-reaper.handler.ts   # cron-очередь jobs.lease-reaper (раз в минуту)
├── job-retention.handler.ts  # cron-очередь jobs.retention: удаление старых записей
├── job-run.entity.ts         # JobRun (таблица job_runs)
├── job-run.repository.ts     # Выборки и точечные UPDATE записей
├── job-run.tracker.ts        # Переходы статусов, прогресс, JobUpdatedEvent
├── jobs.service.ts           # Список, карточка, отмена — с проверкой доступа
├── jobs.controller.ts        # REST /api/v1/jobs (jwt)
├── external-job.service.ts   # Внешние задачи: передача воркеру (сразу и повтором), файлы, ход и итог в job_runs, сверка, срок, хуки
├── external-sync.handler.ts  # cron-очередь jobs.external-sync: внешние задачи с истёкшим сроком
├── jobs.listener.ts          # JobUpdatedEvent → сокет job:updated
├── job-room.policy.ts        # Комната job_<id> по room:subscribe
├── demo-echo.handler.ts      # Внешняя демо-очередь demo.echo
├── jobs.errors.ts            # JobsError (JOB_*)
├── jobs.types.ts             # EJobRunStatus, константы
├── dto/, validation/, events/
└── *.test.ts                 # Юнит-тесты; jobs.integration.test.ts — с настоящим Postgres
```

## Как пользоваться

```ts
// Обработчик Node-очереди
@Injectable()
export class ExportJob implements IJobHandler<
  { projectId: string },
  { key: string }
> {
  readonly definition = {
    queue: "project.export",
    tracked: true,
    retryLimit: 2,
  };

  async handle(ctx: JobContext<{ projectId: string }>) {
    for (const [i, chunk] of chunks.entries()) {
      if (ctx.signal.aborted)
        throw new JobError("CANCELLED", "Отменена", false);
      await ctx.progress(i / chunks.length, `часть ${i + 1}`);
    }
    return { key };
  }
}
// @Module({ providers: [asJobHandler(ExportJob)] })

// Постановка — в транзакции с данными (outbox)
await dataSource.transaction(async manager => {
  await manager.save(order);
  await jobQueue.enqueue(
    "project.export",
    { projectId },
    {
      manager,
      title: "Экспорт",
      ownerId: userId,
      scope: { type: "project", id: projectId },
    },
  );
});
```

## Очереди и `definition`

| Поле                | Умолчание          | Смысл                                                                                  |
| ------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `retryLimit`        | 3                  | повторов после ошибки                                                                  |
| `retryDelaySeconds` | 10                 | задержка первого повтора                                                               |
| `retryBackoff`      | true               | экспоненциальная задержка                                                              |
| `expireInSeconds`   | 900                | сколько задача может быть активной; для внешних — срок всей работы у воркера           |
| `concurrency`       | `JOBS_CONCURRENCY` | параллельных задач очереди на процесс                                                  |
| `cron`              | —                  | расписание (UTC); выполняет один процесс кластера                                      |
| `tracked`           | false              | видимая задача: запись `job_runs`, прогресс, отмена, сокет                             |
| `external`          | false              | выполняет воркер агента; задача всегда видимая; `retry*` — повторы передачи            |
| `job`               | —                  | для `external` (обязательно): тип задачи воркера `{ type, worker? }` (`manifest.jobs`) |

Политика (`retry*`, `expireInSeconds`) применяется к очереди при каждом старте
(`createQueue`/`updateQueue`). Расписания синхронизируются с кодом: `cron`,
удалённый из `definition`, снимается.

**Ошибки.** `JobError(code, message, retryable)`: `retryable: false` — исход
`deadletter` в pg-boss (`perJobResults`), задача падает без повторов. Любое другое
исключение — повтор по политике; на последней попытке запись `failed`.

**Корреляция.** Каждая задача выполняется в `requestContext` с
`requestId = job:<queue>:<id>` — он попадает во все логи задачи.

**Метрики.** Если привязан токен `JOB_METRICS` (`IJobMetrics { onStart(queue),
onComplete(queue, ms, ok) }`), раннер вызывает его на каждой задаче. Сам модуль
prom-client не использует.

## Entity: JobRun (таблица `job_runs`)

| Поле                       | Тип                      | Описание                                                    |
| -------------------------- | ------------------------ | ----------------------------------------------------------- |
| `id`                       | `uuid` (PK)              | = id задачи pg-boss                                         |
| `queue`                    | `varchar(100)`           | Очередь                                                     |
| `status`                   | `varchar(16)`            | `queued` / `running` / `completed` / `failed` / `cancelled` |
| `title`                    | `varchar(200)`           | Заголовок для списка                                        |
| `progress`                 | `real`, 0..1             | Прогресс                                                    |
| `progressText`             | `varchar(200)`, nullable | Что делается сейчас                                         |
| `logTail`                  | `jsonb`                  | Последние 200 строк лога                                    |
| `result`                   | `jsonb`, nullable        | Результат                                                   |
| `error`                    | `jsonb`, nullable        | `{ code, message }` последней ошибки                        |
| `ownerId`                  | `uuid`, nullable         | Владелец (без FK: инфраструктурная таблица)                 |
| `scopeType` / `scopeId`    | `varchar`, nullable      | Область видимости (тип + id, например `project`)            |
| `attempt`                  | `int`                    | Номер попытки, с 0                                          |
| `cancelRequested`          | `boolean`                | Запрошена отмена                                            |
| `leaseUntil`               | `timestamptz`, nullable  | Аренда выполняющейся Node-задачи                            |
| `agentId`                  | `varchar(64)`, nullable  | Агент, у воркера которого выполняется внешняя задача        |
| `worker`                   | `varchar(32)`, nullable  | Воркер агента                                               |
| `jobType`                  | `varchar(64)`, nullable  | Тип задачи воркера (`echo.long`), пишется до передачи       |
| `outputs`                  | `jsonb`, nullable        | Файлы итога `[{ name, key, size }]` — загруженные воркером  |
| `externalId`               | `varchar(128)`, nullable | Id задачи у воркера (`202 { id }`; у быстрой — `id` записи) |
| `deadlineAt`               | `timestamptz`, nullable  | Срок внешней задачи (`expireInSeconds` от передачи)         |
| `startedAt` / `finishedAt` | `timestamptz`, nullable  |                                                             |
| `createdAt` / `updatedAt`  | `timestamptz`            |                                                             |

Индексы: `IDX_JOB_RUNS_OWNER_CREATED`, `IDX_JOB_RUNS_SCOPE_CREATED`,
`IDX_JOB_RUNS_STATUS_LEASE`, `IDX_JOB_RUNS_AGENT_STATUS`, `IDX_JOB_RUNS_EXTERNAL`
(агент + задача у воркера), `IDX_JOB_RUNS_STATUS_DEADLINE`.

Запись создаётся при `enqueue` для `tracked`/`external` очередей и при опции
`track: true`, в той же транзакции, что и задача pg-boss (переданной `manager`
или своей). Задачи из cron для видимой очереди получают запись при старте.
Прогресс и лог пишутся точечным `UPDATE` не чаще 2 раз в секунду.

## Отмена и аренда

- `JobQueue.cancel(id)` / `POST /jobs/{id}/cancel`: флаг `cancelRequested`,
  `boss.cancel`, затем `NOTIFY job_cancel '<id>'`. Ждущая и внешняя задача сразу
  `cancelled`; выполняющаяся Node-задача получает `ctx.signal.abort()` и после
  выхода обработчика становится `cancelled`.
- `JobSignals` слушает каналы `job_cancel`, `job_settled`, `job_queued` одним
  соединением на процесс (на всех ролях). Если LISTEN недоступен (PgBouncer в
  transaction mode, обрыв), подписчики переходят на опрос, а соединение
  переподключается раз в 30 с: воркер опрашивает флаги своих задач раз в 2 с.

## Запрос-ответ (`JobQueue.request`)

`await jobQueue.request<TData, TResult>(queue, data, { timeoutMs, priority, title })`
— поставить видимую задачу и дождаться итога. Переход записи в итоговый статус
шлёт `NOTIFY job_settled '<id>'` в транзакции завершения; `JobResultWaiter`
перечитывает запись по сигналу (и опросом: раз в 5 с с LISTEN, раз в 1 с без).
Итог: `completed` → `result`; `failed`/`cancelled` → 502 `JOB_REQUEST_FAILED`
(`details`: `code`, `reason` исполнителя); таймаут (по умолчанию 30 с) → задача
отменяется, 504 `JOB_REQUEST_TIMEOUT`. Без `manager`: ждать коммита чужой
транзакции нельзя.

- Аренда: Node-задача продлевает `leaseUntil` (60 с) каждые 20 с; у внешней задачи
  аренды нет — её ход приходит событиями воркера, срок — `deadlineAt`.
  cron `jobs.lease-reaper` (и старт воркера) находит `running` с истёкшей арендой,
  проваливает активную задачу в pg-boss и приводит запись к её состоянию:
  есть повторы — `queued`, нет — `failed` (`LEASE_EXPIRED`).
- Остановка процесса: pg-boss ждёт активные задачи до `JOBS_SHUTDOWN_TIMEOUT_MS`,
  затем проваливает их (повтор) и прерывает `ctx.signal`.

## REST (jwt)

| Метод | Путь                       | Описание                                                                                                                               |
| ----- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET   | `/api/v1/jobs`             | Свои задачи или задачи scope (`scopeType`+`scopeId`), `status`, `offset`/`limit` → `IPaginatedDto<JobRunDto>`                          |
| GET   | `/api/v1/jobs/{id}`        | Задача; `?waitSeconds=0–25` — long-poll: ответ в момент завершения или через `waitSeconds` с текущим прогрессом                        |
| POST  | `/api/v1/jobs/{id}/cancel` | Отмена (204); завершённая — 409 `JOB_NOT_CANCELLABLE`                                                                                  |
| POST  | `/api/v1/jobs/demo/echo`   | Демо-задача `demo.echo` воркеру `echo` (`text`, `long`, `steps`, `delayMs`, `fail`, `withOutput`) → 201 `{ jobId }`; право `jobs:demo` |

Доступ: владелец, суперпользователь или `IJobAccessPolicy` scope — токен
`JOB_ACCESS_POLICY` (`asJobAccessPolicy(Cls)`): модуль-владелец scope решает,
кто видит (`view`) и отменяет (`cancel`) задачи. Пример: пространство разрешает
участникам.

Права — `JobsPermissions` (группа «Фоновые задачи»): `jobs:demo` — проверка агентов
демо-задачей; по умолчанию только у admin (через `*`).

## Внешние задачи (агенты)

Внешнюю очередь объявляет `IExternalJobHandler` (`asExternalJobHandler(Cls)`,
`definition.external = true`, `job: { type, worker? }` — тип задачи воркера); выполняет её
исполнитель `EXTERNAL_JOB_EXECUTOR` (ядро, `core/jobs`) — в проекте это воркеры агентов по
стандарту задач `/jobs` (`AgentJobExecutor`, модуль `agent`). Модуль задач с агентами
напрямую не связан: только контракт ядра.

- **Постановка** — как у любой видимой задачи: запись `job_runs` и задача pg-boss в
  одной транзакции (outbox, `priority`, `singletonKey` работают). Без `startAfter` в той же
  транзакции уходит `NOTIFY job_queued '<id>'`, а задача pg-boss откладывается на 10 с
  (`JOB_EXTERNAL_START_DELAY_SECONDS`).
- **Передача сразу** — по сигналу (дойдёт после коммита, в том числе outbox-транзакции)
  процессы, которым доступны агенты (`executor.canDispatch`: роли с HTTP, с пересылкой —
  любые), вызывают `ExternalJobService.startNow`: запись берётся условным `UPDATE`
  (`claimDispatch`: задача ждёт, `externalId` пуст, никто не передаёт — `startedAt` пуст
  или старше 90 с), и задача уходит воркеру без ожидания опроса pg-boss. Подходящего
  агента нет — запись снова ждёт (`releaseDispatch`, ошибка `NO_AGENT` в записи), её
  передаст повтор pg-boss или подключение агента (`startQueued`).
- **Передача повтором** — задача pg-boss (`dispatch`) делает то же: уже передана или
  завершена — ничего; передаёт другой процесс — повтор позже (`JOB_DISPATCHING`). Сбой
  передачи (нет агента, воркер недоступен или занят, связь) — повтор по `retryLimit` /
  `retryDelaySeconds`, в записи — `attempt` и последняя ошибка; неверная задача (отказ
  `400`, `JOB_INVALID`), без повторов или на последней попытке — `failed`; исполнителя
  нет — `EXTERNAL_EXECUTOR_MISSING`.
- **Тип задачи** — `definition.job.type` или хук `jobType(job)` (тип на задачу); файлы —
  хук `io(job)`: ключи хранилища `inputs` (подписанный `GET`) и `outputs` (подписанный
  `PUT`, `contentType` входит в подпись), срок ссылок — не меньше `expireInSeconds`.
- **Быстрая задача** — итог в ответе воркера: запись связывается с задачей (`externalId` =
  id записи) и сразу завершается (`onComplete`), событий нет.
- **Долгая задача** — запись получает агента, воркер, id задачи у воркера и срок
  (`deadlineAt`), статус — `running`. Ход и итог — события `job.progress`, `job.done`,
  `job.failed`, `job.cancelled` (с `jobId` записи и `id` задачи у воркера) приходят в процесс
  с соединением агента и пишутся в `job_runs` до подтверждения агенту. Событие может прийти
  повторно — запись меняется только пока задача не завершена (условный `UPDATE`), итог
  записывается один раз. Событие другой задачи воркера (передали другому агенту)
  пропускается.
- **Итог** — `onComplete(ctx, result)` в транзакции перевода записи в `completed`
  (`ctx.manager`, `ctx.data` — данные задачи из pg-boss, `ctx.outputs` — ключи выходных
  файлов). Выходы, которые воркер загрузил (есть в хранилище), с размером — в
  `outputs` записи; клиенту (`GET /jobs`, `GET /jobs/{id}`, `job:updated`) — `outputs:
[{ name, url, size?, expiresAt }]`: подписанные ссылки на скачивание (`GET`, срок —
  `STORAGE_SIGNED_URL_TTL_SECONDS`), подписываются при каждой выдаче. Ошибка хука — `failed` с `JOB_COMPLETE_FAILED`. Провал задачи — `failed` с
  ошибкой воркера и `onFail(job, error)`. Повторов после провала нет: передачу повторяет
  pg-boss, задачу — воркер сам.
- **Сверка** — после подключения агента и после перезапуска его воркера незавершённые
  задачи опрашиваются (`GET /jobs/{id}`); воркер о задаче не знает — `failed` с
  `EXTERNAL_JOB_LOST`; ждущие внешние задачи передаются.
- **Срок** — cron `jobs.external-sync` раз в минуту: задача с истёкшим `deadlineAt` —
  `failed` с `JOB_TIMEOUT`, задача у воркера отменяется.
- **Отмена** — `JobQueue.cancel`: запись сразу `cancelled`, воркеру — `POST
/jobs/{id}/cancel` (из любого процесса — SDK пересылает в процесс с соединением).

Ждать итог из HTTP-запроса — `JobQueue.request`. Своя очередь и воркер — README модуля
`agent` («Своя очередь задач и воркер»).

Реестр при регистрации отклоняет `expireInSeconds` больше суток (предел pg-boss).

## События

| EventBus          | Сокет         | Куда                                                                                                         |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `JobUpdatedEvent` | `job:updated` | комната `job_<id>`; комната scope `<scopeType>_<scopeId>` (если есть); владельцу — всегда (его список задач) |

Комната `job` (`room:subscribe { type: "job", id }`) — суперпользователю (по
актуальным правам из БД через `AccessService`), владельцу или по `IJobAccessPolicy`.

## Очереди модуля

| Очередь              | Тип               | Что делает                                              |
| -------------------- | ----------------- | ------------------------------------------------------- |
| `jobs.lease-reaper`  | cron `* * * * *`  | возвращает задачи с истёкшей арендой                    |
| `jobs.retention`     | cron `30 3 * * *` | удаляет завершённые записи старше `JOBS_RETENTION_DAYS` |
| `jobs.external-sync` | cron `* * * * *`  | проваливает внешние задачи с истёкшим сроком            |
| `demo.echo`          | external          | эталон внешней очереди (воркер `agent/workers/echo`)    |

## Конфиг

`JOBS_CONCURRENCY` (4), `JOBS_SHUTDOWN_TIMEOUT_MS` (20000), `JOBS_POOL_MAX` (4),
`JOBS_RETENTION_DAYS` (30),
`APP_ROLE` (`api`/`worker`/`all`); БД — `POSTGRES_*`. pg-boss держит свою схему
`pgboss` (миграции — сам, `migrate: true`) и свой пул; на ролях `worker`/`all` —
ещё одно соединение под LISTEN pg-boss; на всех ролях — одно под сигналы задач
(`JobSignals`).

## Тесты

Юнит: раннер, очередь, сервис, контроллеры, reaper, watcher, троттлинг прогресса,
listener, внешние задачи. Интеграция с Postgres (в том числе внешние задачи: передача сразу
после постановки и после коммита outbox, быстрая задача, ход и итог событиями, повтор
события, ожидание агента, отмена, сверка, срок) —
`TEST_DATABASE_URL=postgres://… yarn test:file src/modules/jobs/jobs.integration.test.ts`
(без переменной — пропускается; БД одноразовая: схема `pgboss` и `job_runs`
пересоздаются).
