---
module: core/jobs
summary: Контракт очереди фоновых задач — JobQueue как DI-токен, IJobHandler, реестр обработчиков и хук метрик; реализация в модуле jobs.
---

# jobs

Абстракция очереди задач: модули ставят задачи и объявляют обработчики, не зная о
pg-boss. Реализация — модуль `modules/jobs`.

## Public API

| Экспорт                              | Что                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `JobQueue`                           | абстрактный класс-токен: `enqueue(queue, data, options?)` → id или `null`                 |
| `EnqueueOptions`                     | `startAfter`, `singletonKey` (дедупликация), `priority`, `manager` (транзакция)           |
| `IJobHandler`, `JobDefinition`       | обработчик: `definition` (очередь, повторы, срок, параллельность, `cron`) + `handle(ctx)` |
| `JobContext`                         | `id`, `queue`, `data`, `attempt` (с 0), `signal`                                          |
| `JobError(code, message, retryable)` | ошибка с кодом; `retryable: false` — без повторов                                         |
| `JOB_HANDLER`, `asJobHandler`        | реестр обработчиков для `@Module.providers`                                               |
| `JOB_METRICS`, `IJobMetrics`         | необязательный хук `onStart`/`onComplete`                                                 |

## Устройство

- Модуль регистрирует обработчик `asJobHandler(MyJob)`; очередь собирает их через
  `JOB_HANDLER` на старте.
- Умолчания `JobDefinition`: 3 повтора, первая задержка 10 с, экспоненциальный backoff,
  срок 900 с, параллельность — `JOBS_CONCURRENCY`. Имя очереди — `домен.действие`.
- `cron` в `definition` — периодическая задача, выполняется ровно одним процессом
  кластера.
- `manager` в `enqueue` — задача создаётся в той же транзакции (outbox): откат
  отменяет и задачу.
- `JOB_METRICS` привязывает `ObservabilityModule` (`PrometheusJobMetrics`), очередь
  инжектит его как `@optional()`.

## Зависимости

Только типы `typeorm` и `core/decorators`. Реализует `modules/jobs`; ставят задачи
file и mailer; обработчики — audit, file, mailer, otp, passkeys, session.

## Gotcha

- `signal` срабатывает и при остановке процесса, и по истечении срока — долгий
  обработчик обязан его слушать.
- `enqueue` с `singletonKey` возвращает `null`, если такая задача ещё не завершена.
- Задачи выполняются только на `APP_ROLE=worker|all`; `api` только ставит.
