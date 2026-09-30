# Модуль Jobs

Очередь задач на pg-boss 12 (Postgres): реализация `JobQueue` из ядра
(`src/core/jobs`). Задачи переживают рестарт, повторяются по политике очереди,
выполняются на процессах `APP_ROLE=worker|all`; cron-задачи выполняет ровно
один процесс кластера. Поверх pg-boss — видимые задачи (`job_runs`: статус,
прогресс, лог, отмена между процессами, события по сокету) и HTTP API для
внешних воркеров на любом языке (эталонный SDK — `python/`).

## Структура файлов

```
src/modules/jobs/
├── jobs.module.ts            # @Module: провайдеры, JobQueue → PgBossJobQueue, бутстрапер
├── pg-boss.service.ts        # Экземпляр pg-boss: свой пул и схема, ready(), findJob, failFinal
├── pg-boss-job.queue.ts      # JobQueue: enqueue (outbox через manager), request, cancel, stop
├── jobs.bootstrap.ts         # Запуск: start → createQueue → (worker) work + schedule; graceful stop
├── job-handler.registry.ts   # Обработчики из JOB_HANDLER по очереди, умолчания definition
├── job.runner.ts             # Выполнение Node-задачи: контекст, requestId, повторы, метрики
├── job-progress.writer.ts    # Троттлинг ctx.progress/ctx.log (≤ 2 записи/с)
├── job-signals.ts            # LISTEN/NOTIFY: job_cancel, job_settled, job_available — одно соединение
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
├── jobs-worker.service.ts    # Фасад внешних воркеров: claim/heartbeat/complete/fail
├── jobs-worker.controller.ts # REST /api/v1/worker (apiKey)
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

| Поле                | Умолчание          | Смысл                                                           |
| ------------------- | ------------------ | --------------------------------------------------------------- |
| `retryLimit`        | 3                  | повторов после ошибки                                           |
| `retryDelaySeconds` | 10                 | задержка первого повтора                                        |
| `retryBackoff`      | true               | экспоненциальная задержка                                       |
| `expireInSeconds`   | 900                | сколько задача может быть активной (и для внешних — тоже)       |
| `concurrency`       | `JOBS_CONCURRENCY` | параллельных задач очереди на процесс                           |
| `cron`              | —                  | расписание (UTC); выполняет один процесс кластера               |
| `tracked`           | false              | видимая задача: запись `job_runs`, прогресс, отмена, сокет      |
| `external`          | false              | выполняет внешний воркер; задача всегда видимая                 |
| `leaseSeconds`      | 60                 | для `external`: аренда без heartbeat, потом задача возвращается |

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
| `stopRequested`            | `boolean`                | Запрошена штатная досрочная остановка (внешняя задача)      |
| `leaseUntil`               | `timestamptz`, nullable  | Аренда выполняющейся задачи                                 |
| `files`                    | `jsonb`, nullable        | Ключи файлов внешней задачи                                 |
| `startedAt` / `finishedAt` | `timestamptz`, nullable  |                                                             |
| `createdAt` / `updatedAt`  | `timestamptz`            |                                                             |

Индексы: `IDX_JOB_RUNS_OWNER_CREATED`, `IDX_JOB_RUNS_SCOPE_CREATED`,
`IDX_JOB_RUNS_STATUS_LEASE`.

Запись создаётся при `enqueue` для `tracked`/`external` очередей и при опции
`track: true`, в той же транзакции, что и задача pg-boss (переданной `manager`
или своей). Задачи из cron для видимой очереди получают запись при старте.
Прогресс и лог пишутся точечным `UPDATE` не чаще 2 раз в секунду.

## Отмена и аренда

- `JobQueue.cancel(id)` / `POST /jobs/{id}/cancel`: флаг `cancelRequested`,
  `boss.cancel`, затем `NOTIFY job_cancel '<id>'`. Ждущая и внешняя задача сразу
  `cancelled`; выполняющаяся Node-задача получает `ctx.signal.abort()` и после
  выхода обработчика становится `cancelled`.
- `JobSignals` слушает каналы `job_cancel`, `job_settled`, `job_available` одним
  соединением на процесс (на всех ролях). Если LISTEN недоступен (PgBouncer в
  transaction mode, обрыв), подписчики переходят на опрос, а соединение
  переподключается раз в 30 с: воркер опрашивает флаги своих задач раз в 2 с.
- `JobQueue.stop(id)`: выполняющаяся внешняя задача получает `stopRequested` —
  heartbeat вернёт `stop: true`, воркер доводит шаг и вызывает `complete` (он
  принимается). Ждущая и Node-задача — обычная отмена.

## Запрос-ответ (`JobQueue.request`)

`await jobQueue.request<TData, TResult>(queue, data, { timeoutMs, priority, title })`
— поставить видимую задачу и дождаться итога. Переход записи в итоговый статус
шлёт `NOTIFY job_settled '<id>'` в транзакции завершения; `JobResultWaiter`
перечитывает запись по сигналу (и опросом: раз в 5 с с LISTEN, раз в 1 с без).
Итог: `completed` → `result`; `failed`/`cancelled` → 502 `JOB_REQUEST_FAILED`
(`details`: `code`, `reason` воркера); таймаут (по умолчанию 30 с) → задача
отменяется, 504 `JOB_REQUEST_TIMEOUT`. Постановка во внешнюю очередь шлёт
`NOTIFY job_available '<queue>'` — long-poll `claim` просыпается сразу, а не на
следующем опросе (1 с). Без `manager`: ждать коммита чужой транзакции нельзя.

- Аренда: Node-задача продлевает `leaseUntil` (60 с) каждые 20 с, внешняя — heartbeat-ом.
  cron `jobs.lease-reaper` (и старт воркера) находит `running` с истёкшей арендой,
  проваливает активную задачу в pg-boss и приводит запись к её состоянию:
  есть повторы — `queued`, нет — `failed` (`LEASE_EXPIRED`).
- Остановка процесса: pg-boss ждёт активные задачи до `JOBS_SHUTDOWN_TIMEOUT_MS`,
  затем проваливает их (повтор) и прерывает `ctx.signal`.

## REST (jwt)

| Метод | Путь                       | Описание                                                                                                      |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET   | `/api/v1/jobs`             | Свои задачи или задачи scope (`scopeType`+`scopeId`), `status`, `offset`/`limit` → `IPaginatedDto<JobRunDto>` |
| GET   | `/api/v1/jobs/{id}`        | Задача                                                                                                        |
| POST  | `/api/v1/jobs/{id}/cancel` | Отмена (204); завершённая — 409 `JOB_NOT_CANCELLABLE`                                                         |
| POST  | `/api/v1/jobs/demo/echo`   | Демо-задача `demo.echo` внешнему воркеру → 201 `{ jobId }`; право `jobs:demo`                                 |

Доступ: владелец, суперпользователь или `IJobAccessPolicy` scope — токен
`JOB_ACCESS_POLICY` (`asJobAccessPolicy(Cls)`): модуль-владелец scope решает,
кто видит (`view`) и отменяет (`cancel`) задачи. Пример: пространство разрешает
участникам.

Права — `JobsPermissions` (группа «Фоновые задачи»): `jobs:demo` — проверка внешних
воркеров демо-задачей; по умолчанию только у admin (через `*`).

## API внешних воркеров (apiKey)

`@Security("apiKey", ["worker"])` + проверка очереди по scope ключа
`worker:<queue>` (или `worker:*`). Очередь должна быть объявлена `external`.

| Метод | Путь                                 | Тело → ответ                                                                        |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| POST  | `/api/v1/worker/jobs/claim`          | `{ queues[], max?, waitSeconds?, worker? }` → `IClaimedJobDto[]` (long-poll ≤ 25 с) |
| POST  | `/api/v1/worker/jobs/{id}/heartbeat` | `{ attempt?, progress?, text?, log?, events? }` → `{ cancel, stop }`                |
| POST  | `/api/v1/worker/jobs/{id}/complete`  | `{ attempt?, result }` → 204; аренда потеряна — 409 `JOB_LEASE_LOST`                |
| POST  | `/api/v1/worker/jobs/{id}/fail`      | `{ attempt?, code, message, retryable? }` → 204                                     |

`GET /api/v1/worker/status` (jwt) — внешние очереди и воркеры: `claim` с
`worker: { name, meta }` отмечает воркера в `job_workers`; на связи — брал задачи в
последние 90 с. Пропавшие дольше недели забываются (`jobs.retention`).

Реестр при регистрации отклоняет `expireInSeconds` больше суток (предел pg-boss) и
аренду внешней задачи дольше срока выполнения.

Внешнюю очередь объявляет `IExternalJobHandler` (регистрация
`asExternalJobHandler(Cls)`): `definition.external = true`, необязательный хук
`io(job)` — ключи входных/выходных файлов в `FileStorage` (воркер получает
подписанные ссылки), и `onComplete(ctx, result)` — перенос результата в домен
в одной транзакции с завершением задачи (`ctx.manager`). Ошибка `onComplete` —
попытка проваливается с повтором. `onFail` — по желанию. `onEvent(job, event)` —
события воркера из heartbeat по порядку (ошибка хука логируется, задачу не
прерывает); повторы отбрасываются по номеру `seq` (`job_runs.event_seq`,
сбрасывается при новой попытке), так что до хука каждое событие доходит один раз,
если между доставкой и записью номера процесс не упал — хук должен быть
идемпотентным. Протокол целиком —
`python/README.md`.

## События

| EventBus          | Сокет         | Куда                                                                                                         |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `JobUpdatedEvent` | `job:updated` | комната `job_<id>`; комната scope `<scopeType>_<scopeId>` (если есть); владельцу — всегда (его список задач) |

Комната `job` (`room:subscribe { type: "job", id }`) — суперпользователю (по
актуальным правам из БД через `AccessService`), владельцу или по `IJobAccessPolicy`.

## Очереди модуля

| Очередь             | Тип               | Что делает                                                  |
| ------------------- | ----------------- | ----------------------------------------------------------- |
| `jobs.lease-reaper` | cron `* * * * *`  | возвращает задачи с истёкшей арендой                        |
| `jobs.retention`    | cron `30 3 * * *` | удаляет завершённые записи старше `JOBS_RETENTION_DAYS`     |
| `demo.echo`         | external          | эталон протокола воркера (`python/examples/echo_worker.py`) |

## Конфиг

`JOBS_CONCURRENCY` (4), `JOBS_SHUTDOWN_TIMEOUT_MS` (20000), `JOBS_POOL_MAX` (4),
`JOBS_RETENTION_DAYS` (30),
`APP_ROLE` (`api`/`worker`/`all`); БД — `POSTGRES_*`. pg-boss держит свою схему
`pgboss` (миграции — сам, `migrate: true`) и свой пул; на ролях `worker`/`all` —
ещё одно соединение под LISTEN pg-boss; на всех ролях — одно под сигналы задач
(`JobSignals`).

## Тесты

Юнит: раннер, очередь, сервис, фасад воркеров и контроллеры, reaper, watcher,
троттлинг прогресса, listener. Интеграция с Postgres —
`TEST_DATABASE_URL=postgres://… yarn test:file src/modules/jobs/jobs.integration.test.ts`
(без переменной — пропускается; БД одноразовая: схема `pgboss` и `job_runs`
пересоздаются).
