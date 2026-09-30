# Внешние воркеры очереди задач

Задачу внешней очереди выполняет процесс на любом языке: он берёт задачи по
HTTP, шлёт heartbeat с прогрессом и возвращает результат. Сервер (модуль
`jobs`) держит очередь в pg-boss, аренду и отмену — в `job_runs`, а результат
переносит в домен хуком очереди `onComplete`.

```
python/
├── worker_sdk/          # SDK: только requests
│   ├── client.py        # HTTP, ключ, повторы с backoff
│   ├── job.py           # Задача: данные, файлы, прогресс, heartbeat-поток, отмена
│   ├── worker.py        # Цикл claim → выполнение → complete/fail, SIGTERM
│   └── errors.py        # Cancelled, JobFailed, ApiError
├── examples/echo_worker.py   # Очередь demo.echo
├── requirements.txt, pyproject.toml
└── README.md            # Этот протокол
```

Образ: `Dockerfile.worker-python` в корне репозитория.

## Быстрый старт

На этой машине, к API из `.env.development` (ключ — `WORKER_API_KEY` там же):

Воркер — долгоживущий процесс: пока работает, сам забирает задачи своих очередей.

```bash
yarn worker:setup                        # один раз: окружение .venv
yarn worker                              # на переднем плане, пример demo.echo (Ctrl+C — стоп)
yarn worker python/my_worker.py          # свой обработчик
yarn worker:start [файл]                 # то же в фоне (.worker/worker.pid, .worker/worker.log)
yarn worker:stop [--force]               # остановить: текущая задача дорабатывается; --force — сразу
yarn worker:status | worker:logs
```

Вручную:

```bash
pip install -r python/requirements.txt
WORKER_API_URL=http://localhost:8181 WORKER_API_KEY=<prefix.secret> \
  python python/examples/echo_worker.py
```

```python
from worker_sdk import Worker, JobFailed

worker = Worker("http://api:8181", api_key="abcd1234.secret", concurrency=2)

@worker.handler("ml.train")
def train(job):
    dataset = job.input_path("dataset")        # скачать вход по подписанной ссылке
    # job.download("weights", cache / "w.pt")  # или в своё место (кэш), атомарно
    for epoch in range(10):
        job.check_cancelled()                  # отменили — бросит Cancelled
        if job.stop_requested:                 # просят закончить досрочно —
            break                              # сдать то, что есть
        job.progress((epoch + 1) / 10, f"эпоха {epoch + 1}")
        job.event("epoch", {"epoch": epoch + 1, "mAP": 0.5})  # → onEvent на сервере
    if not dataset.stat().st_size:
        raise JobFailed("EMPTY_DATASET", "датасет пуст", retryable=False)
    job.upload("weights", "/tmp/best.pt")      # загрузить выход (PUT)
    return {"mAP": 0.71}                        # → complete, onComplete на сервере

worker.run()
```

## Протокол (для воркера на любом языке)

База: `<API>/api/v1/worker`, JSON, ключ в `X-Api-Key: <prefix>.<secret>` (или
`Authorization: ApiKey <key>`). Ключ выпускает администратор
(`POST /api/v1/api-keys`, право `apikey:create`) со scope `worker:<queue>` или
`worker:*`.

### 1. Взять задачи — `POST /jobs/claim`

```json
{ "queues": ["demo.echo"], "max": 1, "waitSeconds": 20 }
```

Long-poll: без задач сервер держит запрос до `waitSeconds` (не больше 25 с) и
отвечает `[]`. HTTP-таймаут клиента — больше `waitSeconds` (+10–15 с).

```json
[
  {
    "jobId": "0b0c…",
    "queue": "demo.echo",
    "data": { "text": "привет" },
    "attempt": 0,
    "leaseSeconds": 30,
    "inputs": { "source": "https://…signed-get…" },
    "outputs": { "echo": "https://…signed-put…" },
    "outputContentTypes": { "echo": "text/plain" }
  }
]
```

- `attempt` — номер попытки с 0; передавайте его в следующих вызовах: по нему
  сервер отличает вас от воркера, который взял задачу после потери аренды.
- `inputs` — скачать `GET`; `outputs` — загрузить `PUT` телом файла с
  `Content-Type` из `outputContentTypes` (если указан — ровно им, иначе подпись
  не сойдётся). Ссылки живут `STORAGE_SIGNED_URL_TTL_SECONDS`.
- Очередь не из scope ключа — 403 `JOB_QUEUE_FORBIDDEN`; не внешняя — 400
  `JOB_NOT_EXTERNAL`; неизвестная — 400 `JOB_UNKNOWN_QUEUE`.

`worker: { "name": "gpu-1:4242", "meta": { "device": "cuda:0" } }` в теле `claim` —
необязательно: воркер виден в `GET /api/v1/worker/status` (SDK шлёт хост:pid и версию,
`Worker(..., name=, meta=)`).

### 2. Heartbeat — `POST /jobs/{jobId}/heartbeat`

```json
{
  "attempt": 0,
  "progress": 0.4,
  "text": "кадр 40 из 100",
  "log": ["строка"],
  "events": [{ "seq": 4, "type": "epoch", "data": { "epoch": 4, "mAP": 0.61 } }]
}
```

→ `{ "cancel": false, "stop": false }`. Все поля, кроме `attempt`, необязательны.

- Отправлять **чаще `leaseSeconds`** (SDK — каждые `leaseSeconds / 3`), иначе
  аренда истечёт: cron `jobs.lease-reaper` раз в минуту вернёт задачу в очередь
  (или провалит, если повторов нет), и `complete` получит 409.
- Прогресс — не чаще 2 раз в секунду; `text` до 200 символов; `log` — до 100
  строк по 1000 символов за вызов (сервер хранит последние 200).
- `events` — до 100 событий `{ seq, type, data }` за вызов: сервер передаёт их
  хуку очереди `onEvent` по порядку (метрики эпохи, найденные объекты). SDK —
  `job.event(type, data)`.
- Доставка — «как минимум один раз»: неподтверждённое (сеть, таймаут) воркер
  отправляет повторно со следующим heartbeat. `seq` — номер события в попытке
  (1, 2, …); сервер помнит последний принятый и повторы отбрасывает. Без `seq`
  событие принимается всегда. Прогресс и `log` убираются из буфера тоже только
  после ответа сервера.
- `{ "cancel": true }` — задачу отменили или аренда ушла другому: прекратите
  работу, **не** вызывайте `complete`/`fail`.
- `{ "stop": true }` — просят завершить досрочно, но штатно: доведите шаг и
  вызовите `complete` с тем, что есть (обучение сохраняет веса). SDK —
  `job.stop_requested`.

### Сигналы задачи — `POST /jobs/{jobId}/signal`

```json
{ "attempt": 0, "waitSeconds": 25 }
```

→ `{ "cancel": false, "stop": false }`. Long-poll: сервер держит запрос до
`waitSeconds` (не больше 25) и отвечает **сразу**, как только задачу отменили
(`cancel: true`) или попросили остановить (`stop: true`); без сигнала — оба
`false`, спросите снова. Пока задача выполняется, воркер держит такой запрос
открытым — отмена доходит мгновенно, а не с очередным heartbeat. Heartbeat при
этом обязателен: он продлевает аренду. SDK делает это вторым потоком сам; 404 без
кода задачи (старый сервер) — остаётся heartbeat.

### 3. Результат — `POST /jobs/{jobId}/complete`

```json
{ "attempt": 0, "result": { "echo": "привет" } }
```

→ 204. Сервер в одной транзакции вызывает `onComplete` очереди и завершает
задачу. 409 `JOB_LEASE_LOST` — задача уже не ваша (отменена, аренда истекла):
результат не принят, повторять не нужно. 5xx — повторите запрос (идемпотентно:
второй вызов получит 409, если первый прошёл).

### 4. Ошибка — `POST /jobs/{jobId}/fail`

```json
{
  "attempt": 0,
  "code": "MODEL_NOT_FOUND",
  "message": "нет весов",
  "retryable": false
}
```

→ 204. `code` — `ЗАГЛАВНЫЕ_БУКВЫ_И_ЦИФРЫ`. `retryable: true` (по умолчанию) —
повтор по политике очереди (`retryLimit`, задержка с backoff); `false` — задача
падает окончательно.

### Повторы сети

Сетевые ошибки, 429 и 5xx повторяйте с экспоненциальной задержкой и джиттером
(SDK: 0.5 с → 30 с, 5 попыток). 4xx не повторяйте: 401 — неверный/отозванный
ключ, 403 — нет scope, 400 — ошибка запроса, 409 — задача не ваша.

### Остановка

По SIGTERM воркер перестаёт брать задачи и дорабатывает текущие (SDK — после
завершения текущего long-poll). Прерванная задача без heartbeat вернётся в
очередь по истечении аренды.

## Сервер: объявить внешнюю очередь

```ts
@Injectable()
export class TrainJobHandler implements IExternalJobHandler<
  ITrainData,
  ITrainResult
> {
  readonly definition = {
    queue: "ml.train",
    external: true as const,
    leaseSeconds: 60,
    expireInSeconds: 6 * 3600,
    retryLimit: 1,
  };

  constructor(@inject(ModelService) private readonly _models: ModelService) {}

  // Файлы задачи — ключи FileStorage; воркер получит подписанные ссылки.
  io(job: ExternalJobInfo<ITrainData>): ExternalJobFiles {
    return {
      inputs: { dataset: `datasets/${job.data.datasetId}.zip` },
      outputs: { weights: { key: `models/${job.id}/best.pt` } },
    };
  }

  // Та же транзакция, что и завершение задачи.
  async onComplete(ctx: ExternalJobContext<ITrainData>, result: ITrainResult) {
    await this._models.register(ctx.manager, ctx.outputs.weights, result);
  }

  // События из heartbeat (job.event в SDK), по порядку.
  async onEvent(job: ExternalJobInfo<ITrainData>, event: ExternalJobEvent) {
    if (event.type === "epoch") await this._runs.saveEpoch(job.id, event.data);
  }
}
// @Module({ providers: [asExternalJobHandler(TrainJobHandler)] })
// enqueue: jobQueue.enqueue("ml.train", data, { title, ownerId, scope })
// досрочно, но штатно: jobQueue.stop(jobId) → heartbeat вернёт stop: true
// запрос-ответ из HTTP-запроса: await jobQueue.request("ml.predict", data, { timeoutMs: 15_000 })
```

`expireInSeconds` для внешней очереди — предел длительности задачи целиком
(heartbeat его не продлевает).

## Проверка вручную

1. Поднять API и воркер-роль (`APP_ROLE=all yarn dev`), применить миграции
   (`job_runs`, `api_keys`).
2. Войти админом и выпустить ключ:
   `POST /api/v1/api-keys { "name": "echo", "scopes": ["worker:demo.echo"] }` →
   `key`.
3. Поставить задачу `demo.echo` (из кода/REPL: `jobQueue.enqueue("demo.echo",
{ text: "привет" }, { ownerId })`; данные `sleep`, `fail: "retry" | "fatal"`,
   `withOutput`, `inputKey` проверяют прогресс, повтор, ошибку и файлы).
4. `WORKER_API_KEY=<key> python python/examples/echo_worker.py` — задача
   выполнится; `GET /api/v1/jobs/{id}` покажет `completed` и `result.echo`.
5. Отмена: задача с `{ "sleep": 30 }`, затем `POST /api/v1/jobs/{id}/cancel` —
   воркер в течение heartbeat-интервала пишет «отменена сервером».
