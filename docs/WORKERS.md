# Воркеры и агенты

Как в проекте выполняется работа вне HTTP-запроса: Node-воркеры, агенты и их
нагрузки, где лежит код, как устроен протокол и как добавить свою очередь. Команды
запуска — раздел «Commands» в [README](../README.md); протокол агентов —
[protocol/alp/v1](../protocol/alp/v1/README.md); агент — [agent/README.md](../agent/README.md);
SDK нагрузок — [python/README.md](../python/README.md); устройство очереди — README модуля
[jobs](../src/modules/jobs/README.md), агенты на сервере — [agent](../src/modules/agent/README.md).

## Два вида воркеров

Все задачи живут в одной очереди — pg-boss в Postgres. Выполнить задачу может
один из двух исполнителей.

|                     | Node-воркер                                                                              | Агент и его нагрузка                                                              |
| ------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Что это             | процесс бэкенда в роли `worker` (в `yarn dev` — роль `all`)                              | Go-агент на узле + нагрузки (дочерние процессы на любом языке; эталон — Python)   |
| Где код задачи      | `IJobHandler.handle()` в модуле бэкенда                                                  | функция-обработчик нагрузки (`python/`)                                           |
| Как получает задачи | сам из pg-boss                                                                           | сервер раздаёт агенту по свободным слотам (протокол ALP, WebSocket / HTTP sync)   |
| Когда выбирать      | задача на TypeScript с доступом к БД и сервисам: письма, обработка файлов, очистка, cron | другой язык, GPU, тяжёлые зависимости, отдельная машина, долгая автономная работа |
| Примеры в шаблоне   | `mail.send`, `file.process`, `audit.cleanup`                                             | `demo.echo`                                                                       |

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

## Агент и нагрузки

Агент — долгоживущий процесс на узле (сервер, VM, контейнер). Он сам открывает
соединение с бэкендом, держит его (переподключается, переходит на HTTP, если
WebSocket режет прокси), шлёт пульс, метрики хоста и GPU, выполняет команды,
обновляет себя и запускает **нагрузки** — дочерние процессы, которые выполняют
задачи очередей. Нагрузка знает только задачи: связь, повторы, журнал итогов,
учётные данные — забота агента.

```
Бэкенд (Node)                         Агент (Go)                          Нагрузка (Python)
─────────────                         ──────────                          ─────────────────
сервис: jobs.enqueue / request        hello: возможности, задачи ───────► workload.register:
   │ задача в очередь                 status: свободные слоты              очереди и параллельность
   ▼                                     │
очередь (pg-boss) ── job.assign ───────► │ ── job.assign (IPC, fd 3) ─────► обработчик(job):
   │  (по слотам, с подписанными          │                                  job.input_path()
   │   ссылками на файлы)                 │ ◄── job.progress / job.event ──  job.progress(), job.event()
   │ ◄── job.progress / job.event ─────── │ ◄── job.urls (свежие ссылки) ── job.upload()
   │ ◄── job.complete / job.fail ──────── │ ◄── job.complete / job.fail ─── return result / raise JobFailed
   ▼                                      │  (итог — в журнал на диске, до подтверждения)
onComplete(ctx, result): результат → домен
```

- **Очередь объявлена `external`.** Бэкенд её не выполняет, а раздаёт агентам и
  держит хуки: какие файлы отдать (`io`), что сделать с результатом
  (`onComplete`), с событиями (`onEvent`) и ошибкой (`onFail`).
- **Раздача — по слотам.** Агент сообщает свободные места своих очередей в
  `status` (при каждом изменении и раз в 15 с); сервер выдаёт задачи сам, новая
  задача будит раздачу сразу.
- **Аренда** продлевается пульсом агента. Агент без связи дольше `leaseSeconds`
  очереди — задача возвращается в очередь; вернулся раньше — задача продолжается,
  итог из журнала принимается. Для долгих задач `leaseSeconds` и есть допустимое
  время работы без связи.
- **Файлы** не идут через протокол: `io()` называет ключи хранилища, агент
  получает подписанные ссылки и по запросу — свежие (долгая задача, истёкшая
  ссылка).
- **Доступ** — учётные данные агента: регистрация токеном
  (`POST /api/v1/agent-enrollment-tokens`, многоразовый — для парка машин) или
  bootstrap-токеном окружения (`AGENT_BOOTSTRAP_TOKEN`, compose и dev).
- **Внешняя задача всегда видимая**: статус, прогресс, агент-исполнитель и отмена —
  в таблице задач и по сокету.

## Где что лежит

| Путь                                              | Что там                                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `protocol/alp/v1/`                                | протокол ALP: спецификация (`README.md`) и эталонные сообщения (`fixtures/`) — по ним тестируются сервер, агент и SDK             |
| `src/core/jobs/jobs.types.ts`                     | контракты: `JobQueue` (`enqueue`, `request`, `cancel`, `stop`), `IJobHandler`, `IExternalJobHandler`, `JobDefinition`, `JobError` |
| `src/modules/jobs/`                               | очередь (pg-boss), внешние задачи агентов (`external-job.service.ts`, `jobs-agent.capability.ts`), эталонная очередь `demo.echo`  |
| `src/modules/agent/`                              | агенты на сервере: регистрация, канал (WebSocket, HTTP sync), сессии, присутствие, команды, желаемое состояние, выпуски           |
| `agent/kit/`                                      | Go-агент: `link` (связь), `outbox`, `jobs`, `workload` (нагрузки), `commands`, `state`, `telemetry`, `update`, `app` (сборка)     |
| `agent/agent.dev.yaml`, `agent/agent.docker.yaml` | конфигурация агента для разработки и контейнера                                                                                   |
| `agent/install/`                                  | установка на сервер без Docker: `install.sh` и юнит systemd                                                                       |
| `python/worker_sdk/`                              | SDK нагрузки: `Worker` (регистрация очередей, потоки), `Job` (данные, файлы, прогресс, события, отмена), ошибки                   |
| `python/examples/echo_worker.py`                  | эталонная нагрузка очереди `demo.echo`                                                                                            |
| `scripts/agent-dev.sh`, `scripts/agent.sh`        | агент на машине (`yarn agent:*`), Go-команды в контейнере (`yarn agent:go …`)                                                     |
| `Dockerfile.agent`, профиль `agent` в compose     | агент с нагрузками в Docker                                                                                                       |

## Два способа поставить внешнюю задачу

**Фоновая задача — `jobs.enqueue`.** Бэкенд не ждёт; результат переносит в
данные хук `onComplete`. Так ставится `demo.echo`
(`src/modules/jobs/jobs.service.ts`):

```ts
const jobId = await this._queue.enqueue(DEMO_ECHO_QUEUE, data, {
  ownerId: viewer.userId,
  title: "Проверка агента: demo.echo",
});
```

**Запрос-ответ — `jobs.request`.** HTTP-запрос ждёт результат агента
(синхронный вызов тяжёлой функции):

```ts
const result = await this._jobs.request<IEchoData, IEchoResult>(
  DEMO_ECHO_QUEUE,
  { text: "ping" },
  { timeoutMs: 10_000, title: "Эхо" },
);
```

Не ответил за `timeoutMs` (по умолчанию 30 с) — задача отменяется, клиент
получает 504; ошибка агента — 502 с его кодом. У такой очереди `retryLimit: 0`
(ждущий запрос не дождётся повтора), а `onComplete` пустой — результат забирает
ждущий `request`.

`jobs.request` подходит, когда ждёт сам сервер и результат нужен быстро. Если
ждёт пользователь, а работа может идти дольше (агенты заняты, холодный старт
нагрузки), лучше не держать HTTP-запрос с лимитом, а отдать задачу клиенту.

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
с экрана — `POST /api/v1/jobs/{id}/cancel`, агент узнаёт об отмене сразу.

## Как добавить внешнюю очередь

Пример — генерация отчёта: нагрузка получает исходный файл, строит отчёт,
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

/** `report.render`: отчёт строит нагрузка агента, результат — файл и число страниц. */
@Injectable()
export class ReportRenderJob implements IExternalJobHandler<
  IReportRenderData,
  IReportRenderResult
> {
  readonly definition = {
    queue: REPORT_RENDER_QUEUE,
    external: true as const,
    // Агент без связи дольше — задача вернётся в очередь.
    leaseSeconds: 300,
    retryLimit: 2,
    expireInSeconds: 3_600,
  };

  constructor(
    @inject(ReportService) private readonly _reports: ReportService,
  ) {}

  /** Файлы задачи: вход — исходник, выход — зарезервированный ключ отчёта. */
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

  /** Окончательная ошибка — отчёт помечается неудачным. */
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

### 3. Нагрузка: обработчик

`python/report_worker.py`:

```python
"""Нагрузка очереди report.render."""

from __future__ import annotations

import logging

from worker_sdk import Job, JobFailed, Worker

logging.basicConfig(level="INFO", format="%(levelname)s %(name)s: %(message)s")

worker = Worker("report", version="1.0.0")


@worker.job("report.render", concurrency=2)
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

    job.upload("report", "/tmp/report.pdf")   # выход — на зарезервированный ключ (свежая ссылка при сбое)
    return {"pages": pages}                    # → job.complete → onComplete на бэкенде


if __name__ == "__main__":
    worker.run()
```

### 4. Нагрузка в конфигурации агента

`agent/agent.dev.yaml` (и конфигурация агента на сервере):

```yaml
workloads:
  - name: report
    command: ["${AGENT_ROOT}/.venv/bin/python", "-m", "report_worker"]
    dir: ${AGENT_ROOT}/python
    replicas: 1 # экземпляров процесса
    stopTimeout: 5m # доработка задач при остановке и замене
```

### 5. Тесты и запуск

- Бэкенд: юнит-тест хуков (`io`, `onComplete`, `onFail`); e2e — сценарий с
  тестовым агентом (образец — `test/e2e/agents.e2e.ts`, `demo.echo`). Нагрузка:
  тест обработчика в `python/tests/` (образец — `test_worker.py`, фейковый агент по
  socketpair).
- Запуск: `yarn dev`, `yarn agent:setup` (один раз), `yarn agent`. В Docker — свой
  образ `FROM` `Dockerfile.agent` со своим кодом и конфигурацией.

## SDK нагрузки: что есть у задачи

| Метод / свойство                            | Что делает                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `job.data`                                  | данные задачи (JSON, как поставил бэкенд)                                                      |
| `job.attempt`                               | номер попытки, с 0                                                                             |
| `job.inputs` / `job.outputs`                | имена входных и выходных файлов задачи                                                         |
| `job.input_path(name)`                      | скачать входной файл во временный каталог и вернуть путь                                       |
| `job.download(name, target)`                | скачать входной файл в своё место атомарно (кэш)                                               |
| `job.upload(name, source)`                  | загрузить выходной файл (путь, `Path` или `bytes`); при сбое — повтор со свежей ссылкой        |
| `job.refresh_urls(inputs, outputs)`         | свежие подписанные ссылки (сами — перед истечением и после сбоя)                               |
| `job.progress(value, text)`                 | прогресс 0..1 и что делается сейчас (частые вызовы схлопываются)                               |
| `job.log(line)`                             | строка журнала задачи                                                                          |
| `job.event(type, data)`                     | событие для `onEvent` на бэкенде; доставка надёжная (журнал агента), повтор сервер отбрасывает |
| `job.check_cancelled()`                     | бросить `Cancelled`, если задачу отменили                                                      |
| `job.stop_requested`                        | попросили закончить досрочно (`jobs.stop`): довести шаг и вернуть то, что есть                 |
| `return {...}`                              | результат → `job.complete` → `onComplete` / ждущий `request`                                   |
| `raise JobFailed(code, message, retryable)` | ошибка с кодом; `retryable=False` — без повторов                                               |
| любое другое исключение                     | ошибка `WORKER_ERROR`, повтор по политике очереди                                              |

## Ошибки, повторы, отмена, автономность

- **Повторы** — `retryLimit` очереди (с задержкой `retryDelaySeconds`,
  экспоненциально). Запрос-ответ — 0.
- **Связь пропала** — агент работает дальше: прогресс копится в памяти, события и
  итоги — в журнале на диске (`outbox`) до подтверждения сервером. Вернулся в пределах
  аренды — сервер принимает итог той же попытки; позже — попытку уже отдали другому
  агенту, итог отклоняется (`JOB_LEASE_LOST`). Хук `onEvent` делать идемпотентным (upsert).
- **Нагрузка упала** — её задачи проваливаются с `WORKLOAD_CRASHED` (повтор по
  политике), агент перезапускает процесс с backoff (агент в status — `degraded`).
- **Агент перезапустился** — при сверке задача, которую он принял и потерял,
  проваливается с `AGENT_LOST` (повтор), ещё не принятая — выдаётся снова. Итоги,
  завершённые до рестарта, лежат в журнале и доходят.
- **Отмена** (пользователь, таймаут `request`) — доходит до агента сразу
  (сигнал сервера), агент передаёт её нагрузке: `check_cancelled()` прерывает работу,
  итог не отправляется.
- **Досрочная остановка** (`jobs.stop`) — так же сразу: `stop_requested`,
  довести шаг и сдать то, что есть.
- **Остановка агента** (SIGTERM, `yarn agent:stop`) — новые задачи не берутся,
  нагрузки дорабатывают текущие (`stopTimeout`), итоги досылаются.
- **Замена кода нагрузки без простоя** — команда `workload.restart`: новый экземпляр
  поднимается рядом, старый перестаёт брать задачи и завершается после текущих.

## Запуск и диагностика

- На машине: `yarn agent:setup` один раз (и после правок агента), затем `yarn agent`
  или `yarn agent:start`; регистрация — `AGENT_BOOTSTRAP_TOKEN` в `.env.development`.
- В Docker: `docker compose --profile agent up -d [--scale agent=N]`.
- Сервер без Docker: `sudo sh agent/install/install.sh --binary … --server … --token …`
  (systemd, самообновление с откатом).
- Проверить: `POST /api/v1/jobs/demo/echo` (право `jobs:demo`; `sleep`, `fail` —
  проверка прогресса, повторов и отмены). Агенты, их живое состояние и метрики —
  `GET /api/v1/agents`, `GET /api/v1/agents/{id}`; журнал агента — команда `agent.logs`.
- **Задача висит в очереди** — нет агента на связи с этой очередью или нет свободных
  слотов (`live.status.slots` агента).
- **Агент не подключается** — `401`: токен регистрации неверен/исчерпан или агент
  отозван; `426`: прокси режет WebSocket — агент перейдёт на HTTP sync сам.
- **504 на `request`** — агентов нет, они заняты или не укладываются в `timeoutMs`.
- **Нагрузка в Docker не скачивает и не загружает файлы** — подписанные ссылки
  строятся от `APP_PUBLIC_URL` / `S3_PUBLIC_ENDPOINT`; адрес должен открываться из
  контейнера агента.
