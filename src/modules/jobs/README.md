# Модуль Jobs

Очередь задач на pg-boss 12 (Postgres): реализация `JobQueue` из ядра
(`src/core/jobs`). Задачи переживают рестарт, повторяются по политике очереди,
выполняются на процессах `APP_ROLE=worker|all`; cron-задачи выполняет ровно
один процесс кластера.

## Структура файлов

```
src/modules/jobs/
├── jobs.module.ts            # @Module: провайдеры, JobQueue → PgBossJobQueue, бутстрапер
├── pg-boss.service.ts        # Экземпляр pg-boss: свой пул и схема, ready()
├── pg-boss-job.queue.ts      # JobQueue: enqueue (outbox через manager)
├── jobs.bootstrap.ts         # Запуск: start → createQueue → (worker) work + schedule; graceful stop
├── job-handler.registry.ts   # Обработчики из JOB_HANDLER по очереди, умолчания definition
├── job.runner.ts             # Выполнение задачи: контекст, requestId, повторы, метрики
├── jobs.health.ts            # /health: pg-boss запущен
├── jobs.errors.ts            # JobsError (JOB_*)
├── jobs.types.ts             # Константы
└── *.test.ts                 # Юнит-тесты; jobs.integration.test.ts — с настоящим Postgres
```

## Как пользоваться

```ts
@Injectable()
export class ExportJob implements IJobHandler<
  { projectId: string },
  { key: string }
> {
  readonly definition = { queue: "project.export", retryLimit: 2 };

  async handle(ctx: JobContext<{ projectId: string }>) {
    for (const chunk of chunks) {
      if (ctx.signal.aborted) throw new Error("прервано");
      await this._exporter.write(chunk);
    }
    return { key };
  }
}
// @Module({ providers: [asJobHandler(ExportJob)] })

// Постановка — в транзакции с данными (outbox)
await dataSource.transaction(async manager => {
  await manager.save(order);
  await jobQueue.enqueue("project.export", { projectId }, { manager });
});
```

## Очереди и `definition`

| Поле                | Умолчание          | Смысл                                             |
| ------------------- | ------------------ | ------------------------------------------------- |
| `retryLimit`        | 3                  | повторов после ошибки                             |
| `retryDelaySeconds` | 10                 | задержка первого повтора                          |
| `retryBackoff`      | true               | экспоненциальная задержка                         |
| `expireInSeconds`   | 900                | сколько задача может быть активной (≤ суток)      |
| `concurrency`       | `JOBS_CONCURRENCY` | параллельных задач очереди на процесс             |
| `cron`              | —                  | расписание (UTC); выполняет один процесс кластера |

Политика (`retry*`, `expireInSeconds`) применяется к очереди при каждом старте
(`createQueue`/`updateQueue`). Расписания синхронизируются с кодом: `cron`,
удалённый из `definition`, снимается. Реестр при регистрации отклоняет
повторную очередь и `expireInSeconds` больше суток (предел pg-boss).

**Постановка.** `enqueue(queue, data, { startAfter, singletonKey, priority, manager })`;
`null` — задача отброшена дедупликацией по `singletonKey`. Незарегистрированная
очередь — `JOB_UNKNOWN_QUEUE`.

**Ошибки.** `JobError(code, message, retryable)`: `retryable: false` — исход
`deadletter` в pg-boss (`perJobResults`), задача падает без повторов. Любое другое
исключение — повтор по политике.

**Сигнал.** `ctx.signal` срабатывает при остановке процесса и по истечении
`expireInSeconds`: долгая задача проверяет его между шагами.

**Корреляция.** Каждая задача выполняется в `requestContext` с
`requestId = job:<queue>:<id>` — он попадает во все логи задачи.

**Метрики.** Если привязан токен `JOB_METRICS` (`IJobMetrics { onStart(queue),
onComplete(queue, ms, ok) }`), раннер вызывает его на каждой задаче. Сам модуль
prom-client не использует.

## Конфиг

`JOBS_CONCURRENCY` (4), `JOBS_SHUTDOWN_TIMEOUT_MS` (20000), `JOBS_POOL_MAX` (4),
`APP_ROLE` (`api`/`worker`/`all`); БД — `POSTGRES_*`. pg-boss держит свою схему
`pgboss` (миграции — сам, `migrate: true`) и свой пул; на ролях `worker`/`all` —
ещё одно соединение под LISTEN pg-boss.

## Тесты

Юнит: раннер, очередь, реестр, health. Интеграция с Postgres (выполнение, повтор,
deadletter, outbox) —
`TEST_DATABASE_URL=postgres://… yarn test:file src/modules/jobs/jobs.integration.test.ts`
(без переменной — пропускается; БД одноразовая: схема `pgboss` пересоздаётся).
