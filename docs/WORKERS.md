# Воркеры

Как в проекте выполняется работа вне HTTP-запроса: что такое воркер, где лежит
код, как устроен протокол и как добавить свою очередь. Команды запуска — раздел
«Commands» в [README](../README.md), HTTP-протокол для воркера на любом языке —
[python/README.md](../python/README.md), устройство очереди — README модуля
[jobs](../src/modules/jobs/README.md).

## Два вида воркеров

Все задачи живут в одной очереди — pg-boss в Postgres. Выполнить задачу может
один из двух исполнителей.

|                     | Node-воркер                                                                              | Внешний воркер                                                   |
| ------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Что это             | процесс бэкенда в роли `worker` (в `yarn dev` — роль `all`)                              | отдельная программа на любом языке; эталон — Python (`python/`)  |
| Где код задачи      | `IJobHandler.handle()` в модуле бэкенда                                                  | функция-обработчик в программе воркера                           |
| Как получает задачи | сам из pg-boss                                                                           | по HTTP: `POST /api/v1/worker/jobs/claim` с API-ключом           |
| Когда выбирать      | задача на TypeScript с доступом к БД и сервисам: письма, обработка файлов, очистка, cron | нужен другой язык, GPU, тяжёлые зависимости или отдельная машина |
| Примеры в шаблоне   | `mail.send`, `file.process`, `audit.cleanup`                                             | `demo.echo`                                                      |

## Node-воркер

Задача — класс с описанием очереди и методом `handle`. Пример — отправка
письма (`src/modules/mailer/mail-send.job.ts`):

```ts
@Injectable()
export class MailSendJob implements IJobHandler<IMailSendJobData> {
  readonly definition: JobDefinition = {
    queue: MAIL_SEND_QUEUE,
    retryLimit: 5, // повторы с экспоненциальной задержкой
  };

  constructor(@inject(MailerService) private readonly _mailer: MailerService) {}

  handle(ctx: JobContext<IMailSendJobData>): Promise<void> {
    return this._mailer.deliver(ctx.data);
  }
}
```

Регистрация — в `@Module.providers`: `asJobHandler(MailSendJob)`. Постановка —
через `JobQueue`, лучше в транзакции с данными (outbox: откат транзакции
отменяет и задачу):

```ts
await this._jobs.enqueue(MAIL_SEND_QUEUE, job, { manager });
```

- **По расписанию** — `cron` в `definition`: очередь запускает ровно один
  процесс кластера (`audit.cleanup`: `cron: "30 3 * * *"`).
- **Видимая задача** — `tracked: true`: статус, прогресс (`ctx.progress`),
  журнал (`ctx.log`) и отмена в таблице задач и по сокету.
- **Отмена и остановка процесса** — `ctx.signal`; долгий цикл его проверяет.
- **Ошибка без повторов** — `throw new JobError(code, message, false)`.

Выполняют такие задачи процессы с `APP_ROLE=worker` или `all`.

## Внешний воркер

Воркер — долгоживущий процесс. Он сам спрашивает у бэкенда задачи своих очередей
(long-poll до 25 с), выполняет их и сдаёт результат. Задачи вручную не
запускаются — их ставит бэкенд.

```
Бэкенд (Node)                                     Внешний воркер
─────────────                                     ──────────────
сервис: jobs.enqueue / jobs.request
   │  задача в очередь report.render
   ▼
очередь (pg-boss)  ◄────────── claim (long-poll) ──────  Worker.run(): ждёт задачи
   │  выдаёт задачу + подписанные ссылки              │
   │  на файлы (io: inputs / outputs)                 ▼
   │                                                обработчик(job):
   │  ◄────────── heartbeat (прогресс, события) ────  job.input_path(), job.progress(),
   │             ответ: отменить? остановить?         job.event(), job.upload()
   │                                                    │
   ▼  ◄────────── complete(result) / fail(code) ─────  return result / raise JobFailed
onComplete(ctx, result): результат → домен
(или ждущий jobs.request получает результат)
```

- **Очередь объявлена `external`.** Бэкенд её не выполняет, а отдаёт воркерам
  и держит хуки: какие файлы отдать (`io`), что сделать с результатом
  (`onComplete`), с событиями (`onEvent`) и ошибкой (`onFail`).
- **Аренда.** Взятая задача принадлежит воркеру `leaseSeconds`; SDK продлевает
  её heartbeat-ами в фоне. Воркер пропал — аренда истекает, задача возвращается
  в очередь (или падает, если повторы исчерпаны).
- **Файлы** не идут через тело запроса: `io()` называет ключи хранилища, воркер
  получает подписанные ссылки — `inputs` на чтение, `outputs` на запись (PUT).
- **Доступ** — API-ключ сервиса со scope `worker:<очередь>` (или `worker:*`),
  выпускает админ: `POST /api/v1/api-keys`. Воркер действует от имени владельца
  ключа.
- **Внешняя задача всегда видимая**: статус, прогресс и отмена — в таблице
  задач и по сокету.

## Где что лежит

| Путь                                                                       | Что там                                                                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/jobs/jobs.types.ts`                                              | контракты: `JobQueue` (`enqueue`, `request`, `cancel`, `stop`), `IJobHandler`, `IExternalJobHandler`, `JobDefinition`, `JobError` |
| `src/modules/jobs/`                                                        | реализация очереди (pg-boss), HTTP API воркеров `/api/v1/worker/*`, аренда, таблица задач, эталонная очередь `demo.echo`          |
| `src/modules/jobs/demo-echo.handler.ts`                                    | обработчик `demo.echo` на стороне бэкенда — образец внешней очереди                                                               |
| `src/modules/*/…job.ts`                                                    | Node-задачи модулей: `mail.send`, `file.process`, очистки                                                                         |
| `python/worker_sdk/`                                                       | SDK: `Worker` (цикл claim → выполнение → complete/fail), `Job` (данные, файлы, прогресс, heartbeat), ошибки                       |
| `python/examples/echo_worker.py`                                           | эталонный воркер очереди `demo.echo`                                                                                              |
| `python/tests/`                                                            | тесты SDK                                                                                                                         |
| `scripts/python-worker.sh`                                                 | запуск на машине: `yarn worker:setup`, `worker`, `worker:start` / `stop` / `status` / `logs`                                      |
| `Dockerfile.worker-python`, профиль `python-worker` в `docker-compose.yml` | воркер в Docker                                                                                                                   |

## Два способа поставить внешнюю задачу

**Фоновая задача — `jobs.enqueue`.** Бэкенд не ждёт; результат переносит в
данные хук `onComplete`. Так ставится `demo.echo`
(`src/modules/jobs/jobs.service.ts`):

```ts
const jobId = await this._queue.enqueue(DEMO_ECHO_QUEUE, data, {
  ownerId: viewer.userId,
  title: "Проверка воркера: demo.echo",
});
```

**Запрос-ответ — `jobs.request`.** HTTP-запрос ждёт результат воркера
(синхронный вызов тяжёлой функции):

```ts
const result = await this._jobs.request<IEchoData, IEchoResult>(
  DEMO_ECHO_QUEUE,
  { text: "ping" },
  { timeoutMs: 10_000, title: "Эхо" },
);
```

Не ответил за `timeoutMs` (по умолчанию 30 с) — задача отменяется, клиент
получает 504; ошибка воркера — 502 с его кодом. У такой очереди `retryLimit: 0`
(ждущий запрос не дождётся повтора), а `onComplete` пустой — результат забирает
ждущий `request`.

`jobs.request` подходит, когда ждёт сам сервер и результат нужен быстро. Если
ждёт пользователь, а работа может идти дольше (очередь занята, холодный старт
воркера), лучше не держать HTTP-запрос с лимитом, а отдать задачу клиенту.

## Ожидание результата клиентом

Сервер ставит задачу и сразу отвечает её id (`202 { jobId }`); клиент ждёт
итога сам — без общего лимита времени:

- **Сокет** — основной канал интерфейса: `job:updated` (статус, прогресс,
  результат) приходит владельцу и в комнату scope задачи.
- **Long-poll** — `GET /api/v1/jobs/{id}?waitSeconds=25`: сервер держит запрос,
  пока задача не завершится, и отвечает в тот же момент (его будит сигнал
  завершения), иначе через `waitSeconds` — с текущим прогрессом. Клиент
  повторяет запрос, пока статус не итоговый (`completed`, `failed`,
  `cancelled`). `waitSeconds` — предел одного запроса (не больше 25 — меньше
  таймаутов прокси), а не частота опроса; `0` — просто текущее состояние.

```ts
// Ждать итога задачи сколько нужно: цикл коротких long-poll запросов.
const waitForJob = async (jobId: string, signal: AbortSignal) => {
  while (!signal.aborted) {
    const { data } = await api.getJob(jobId, { waitSeconds: 25 }, { signal });

    if (data && ["completed", "failed", "cancelled"].includes(data.status)) {
      return data;
    }
  }
};
```

Сокет и long-poll сочетаются: интерфейс слушает `job:updated`, а после
переподключения сокета сверяет состояние одним `GET ?waitSeconds=0` —
событие о завершении могло прийти, пока соединения не было. Пользователь ушёл
с экрана — `POST /api/v1/jobs/{id}/cancel`, воркер узнаёт об отмене сразу.

## Как добавить внешнюю очередь

Пример — генерация отчёта: воркер получает исходный файл, строит отчёт,
загружает его и сообщает число страниц; бэкенд сохраняет ссылку на отчёт.
Фоновая очередь `report.render` в модуле `report`.

### 1. Бэкенд: обработчик очереди

`src/modules/report/report-render.job.ts`:

```ts
export const REPORT_RENDER_QUEUE = "report.render";

export interface IReportRenderData {
  reportId: string;
  /** Ключ исходного файла в хранилище. */
  sourceKey: string;
}

export interface IReportRenderResult {
  pages: number;
}

/** `report.render`: отчёт строит внешний воркер, результат — файл и число страниц. */
@Injectable()
export class ReportRenderJob implements IExternalJobHandler<
  IReportRenderData,
  IReportRenderResult
> {
  readonly definition = {
    queue: REPORT_RENDER_QUEUE,
    external: true as const,
    leaseSeconds: 120, // без heartbeat дольше — задача вернётся в очередь
    retryLimit: 2,
    expireInSeconds: 3_600,
  };

  constructor(
    @inject(ReportService) private readonly _reports: ReportService,
  ) {}

  /** Файлы воркера: вход — исходник, выход — зарезервированный ключ отчёта. */
  io(job: ExternalJobInfo<IReportRenderData>): ExternalJobFiles {
    return {
      inputs: { source: job.data.sourceKey },
      outputs: {
        report: {
          key: `reports/${job.data.reportId}/report.pdf`,
          contentType: "application/pdf",
        },
      },
    };
  }

  /** Результат → домен атомарно с завершением задачи (`ctx.manager`). */
  onComplete(
    ctx: ExternalJobContext<IReportRenderData>,
    result: IReportRenderResult,
  ): Promise<void> {
    return this._reports.markReady(ctx.manager, ctx.data.reportId, {
      fileKey: ctx.outputs.report,
      pages: result.pages,
    });
  }

  /** Окончательная ошибка воркера — отчёт помечается неудачным. */
  async onFail(
    job: ExternalJobInfo<IReportRenderData>,
    failure: ExternalJobFailure,
  ): Promise<void> {
    if (failure.final)
      await this._reports.markFailed(job.data.reportId, failure.code);
  }
}
```

### 2. Бэкенд: регистрация и постановка

В модуле: `asExternalJobHandler(ReportRenderJob)` в `providers`. В сервисе —
в той же транзакции, что и запись отчёта:

```ts
await this._jobs.enqueue(
  REPORT_RENDER_QUEUE,
  { reportId: report.id, sourceKey: file.key },
  { manager, ownerId: userId, title: `Отчёт: ${report.name}` },
);
```

### 3. Воркер: обработчик

`python/report_worker.py` (путь от корня — для `yarn worker <файл>`):

```python
"""Воркер очереди report.render."""

from __future__ import annotations

import logging
import os

from worker_sdk import Job, JobFailed, Worker

logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(name)s: %(message)s")

worker = Worker(
    os.environ["WORKER_API_URL"],
    api_key=os.environ["WORKER_API_KEY"],
    concurrency=int(os.environ.get("WORKER_CONCURRENCY", "1")),
)


@worker.handler("report.render")
def render(job: Job) -> dict:
    source = job.input_path("source")          # скачать вход по подписанной ссылке
    if source.stat().st_size == 0:
        # Повтор не поможет — сразу окончательная ошибка.
        raise JobFailed("EMPTY_SOURCE", "исходный файл пуст", retryable=False)

    # build_report — своя функция построения отчёта; колбэк вызывается на каждой странице.
    pages = build_report(source, "/tmp/report.pdf", on_page=lambda done, total: (
        job.check_cancelled(),                  # отменили — Cancelled, выход
        job.progress(done / total, f"страница {done} из {total}"),
    ))

    job.upload("report", "/tmp/report.pdf")   # выход — на зарезервированный ключ
    return {"pages": pages}                    # → complete → onComplete на бэкенде


if __name__ == "__main__":
    worker.run()
```

### 4. Доступ, тесты, запуск

- Ключ со scope `worker:report.render` (или `worker:*`) — в `WORKER_API_KEY`
  файла `.env.development`.
- Бэкенд: юнит-тест хуков (`io`, `onComplete`, `onFail`); e2e — сценарий, где
  очередь выполняет тестовый воркер (образец — e2e `demo.echo`). Воркер: тест
  обработчика в `python/tests/` (образец — `test_job.py`).
- Запуск: `yarn dev` и `yarn worker python/report_worker.py` (или
  `yarn worker:start python/report_worker.py` в фоне). В Docker — свой образ
  `FROM` `Dockerfile.worker-python` или замена `CMD`.

## SDK воркера: что есть у задачи

| Метод / свойство                            | Что делает                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `job.data`                                  | данные задачи (JSON, как поставил бэкенд)                                                                              |
| `job.attempt`                               | номер попытки, с 0                                                                                                     |
| `job.inputs` / `job.outputs`                | имена входных и выходных файлов задачи                                                                                 |
| `job.input_path(name)`                      | скачать входной файл во временный каталог и вернуть путь                                                               |
| `job.download(name, target)`                | скачать входной файл в своё место атомарно (кэш)                                                                       |
| `job.upload(name, source)`                  | загрузить выходной файл (путь, `Path` или `bytes`)                                                                     |
| `job.progress(value, text)`                 | прогресс 0..1 и что делается сейчас                                                                                    |
| `job.log(line)`                             | строка журнала задачи                                                                                                  |
| `job.event(type, data)`                     | событие для `onEvent` на бэкенде (промежуточные метрики и т. п.); при сбое сети не теряется, повтор сервер отбрасывает |
| `job.check_cancelled()`                     | бросить `Cancelled`, если задачу отменили                                                                              |
| `job.stop_requested`                        | попросили закончить досрочно (`jobs.stop`): довести шаг и вернуть то, что есть                                         |
| `return {...}`                              | результат → `complete` → `onComplete` / ждущий `request`                                                               |
| `raise JobFailed(code, message, retryable)` | ошибка с кодом; `retryable=False` — без повторов                                                                       |
| любое другое исключение                     | ошибка `WORKER_ERROR`, повтор по политике очереди                                                                      |

## Ошибки, повторы, отмена

- **Повторы** — `retryLimit` очереди (с задержкой `retryDelaySeconds`,
  экспоненциально). Запрос-ответ — 0.
- **Сбой сети между воркером и бэкендом** — неподтверждённые прогресс, журнал и
  события уходят со следующим heartbeat; повторы событий сервер отбрасывает по
  номеру. Хук `onEvent` всё равно стоит делать идемпотентным (upsert).
- **Сбой воркера** (процесс убит, сеть) — аренда истекает, задача
  возвращается в очередь; следующий воркер начнёт её заново. Поэтому
  обработчик должен быть идемпотентным: выходные ключи фиксированы, повторная
  загрузка перезаписывает файл.
- **Отмена** (пользователь, таймаут `request`) — доходит до воркера сразу:
  пока задача выполняется, SDK держит long-poll сигналов
  (`/worker/jobs/{id}/signal`), бэкенд будит его сигналом NOTIFY;
  `check_cancelled()` прерывает работу, результат не отправляется.
- **Досрочная остановка** (`jobs.stop`) — так же сразу: `stop_requested`,
  довести шаг и сдать то, что есть.
- **Остановка процесса воркера** (SIGTERM, `yarn worker:stop`) — новые задачи
  не берёт, текущую дорабатывает.

## Запуск и диагностика

- На машине: `yarn worker:setup` один раз, затем `yarn worker [файл]` или
  `yarn worker:start [файл]`; ключ — `WORKER_API_KEY` в `.env.development`.
- В Docker: `docker compose --profile python-worker up -d`.
- Проверить, что воркер подключён: `POST /api/v1/jobs/demo/echo` (право
  `jobs:demo`) ставит задачу `demo.echo`; кто подключён —
  `GET /api/v1/worker/status`.
- **Задача висит в очереди** — нет воркера этой очереди или у ключа нет scope
  `worker:<очередь>`.
- **504 на `request`** — воркер не запущен, занят или не укладывается в
  `timeoutMs`.
- **Воркер в Docker не скачивает файлы** — подписанные ссылки строятся от
  `APP_PUBLIC_URL`; адрес должен открываться из контейнера воркера.
