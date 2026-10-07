# SDK нагрузки агента (Python)

Нагрузка — процесс, выполняющий задачи внешних очередей. Её запускает **агент**
(`agent/`, Go) по своей конфигурации (`workloads`) и связывает с собой локальным
каналом IPC (протокол ALP, §10 —
[protocol/alp/v1](../protocol/alp/v1/README.md)). Связь с сервером, переподключение,
журнал итогов при обрыве, учётные данные и обновление — забота агента; нагрузка
только выполняет задачи. SDK — без внешних зависимостей (стандартная библиотека).

```
python/
├── worker_sdk/
│   ├── worker.py        # Worker: регистрация очередей, пул потоков, отмена, drain, SIGTERM
│   ├── job.py           # Job: данные, файлы (свежие ссылки, повторы), прогресс, события
│   ├── channel.py       # Канал IPC с агентом: строки JSON, запросы с ответом
│   ├── files.py         # Скачивание и загрузка по подписанным ссылкам (urllib)
│   └── errors.py        # Cancelled, JobFailed, AgentError
├── examples/echo_worker.py   # Нагрузка очереди demo.echo
├── tests/test_worker.py      # Тесты: фейковый агент по socketpair
└── requirements.txt          # Зависимости обработчиков (у SDK их нет)
```

## Быстрый старт

```bash
yarn agent:setup   # один раз: сборка агента под эту машину и .venv
yarn agent         # агент + нагрузка examples.echo_worker (agent/agent.dev.yaml)
```

Своя нагрузка — модуль в `python/` и запись в `workloads` конфигурации агента:

```python
from worker_sdk import Job, JobFailed, Worker

worker = Worker("report", version="1.0.0")


@worker.job("report.render", concurrency=2)
def render(job: Job) -> dict:
    path = job.input_path("source")
    job.progress(0.5, "строю отчёт")
    job.upload("report", b"...")
    return {"pages": 3}


if __name__ == "__main__":
    worker.run()
```

```yaml
workloads:
  - name: report
    command: ["${AGENT_ROOT}/.venv/bin/python", "-m", "report_worker"]
    dir: ${AGENT_ROOT}/python
    stopTimeout: 5m
```

Нагрузка вне агента не запускается (`ALP_IPC_FD` не задан — понятная ошибка).

## Задача

| Метод / свойство                            | Что делает                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `job.id`, `job.queue`, `job.data`           | задача и её данные                                                                   |
| `job.attempt`                               | номер попытки, с 0                                                                   |
| `job.inputs` / `job.outputs`                | имена входных и выходных файлов                                                      |
| `job.input_path(name)`                      | скачать вход во временный каталог задачи                                             |
| `job.download(name, target)`                | скачать вход в своё место атомарно (кэш)                                             |
| `job.upload(name, source)`                  | PUT выхода (путь, `Path`, `bytes`); сбой — повтор со свежей ссылкой (до 4 попыток)   |
| `job.refresh_urls(inputs, outputs)`         | свежие подписанные ссылки (SDK сам — за минуту до истечения и после сбоя скачивания) |
| `job.progress(value, text)`                 | прогресс 0..1; частые вызовы схлопываются (не чаще 2 раз в секунду)                  |
| `job.log(line)`                             | строка журнала задачи                                                                |
| `job.event(type, data)`                     | событие для `onEvent` очереди; надёжно и по порядку (`seq` в пределах попытки)       |
| `job.cancelled`, `job.check_cancelled()`    | задачу отменили; `check_cancelled()` бросает `Cancelled`                             |
| `job.stop_requested`                        | попросили закончить досрочно: довести шаг и вернуть результат                        |
| `return {...}`                              | результат (JSON) → `job.complete`                                                    |
| `raise JobFailed(code, message, retryable)` | ошибка с кодом (`^[A-Z0-9_]+$`); `retryable=False` — без повторов                    |
| любое другое исключение                     | `WORKER_ERROR`, повтор по политике очереди                                           |

## Жизненный цикл

- **Регистрация.** `worker.run()` объявляет агенту очереди и параллельность
  (`workload.register`); агент добавляет их в свои слоты, сервер начинает раздавать
  задачи. Очереди можно ограничить конфигурацией агента (`queues`).
- **Выполнение** — пул потоков (сумма `concurrency`); обработчик синхронный.
  Тяжёлые вычисления на GPU — `concurrency=1` и отдельная нагрузка.
- **Отмена** (`job.cancel` от агента) — флаг задачи; итог отменённой не отправляется.
- **Остановка** — SIGTERM (агент останавливается или заменяет нагрузку командой
  `workload.restart`): новые задачи не берутся, текущие дорабатываются, затем
  процесс завершается. Агент ждёт `stopTimeout`, потом SIGKILL.
- **Агент пропал** (канал закрыт) — текущие задачи прерываются: итог отдать некому,
  сервер вернёт их по аренде.
- **Логи** — `logging` в stderr: агент пишет вывод нагрузки в свой журнал с её
  именем (команда `agent.logs`, `yarn agent:logs`).

## Тесты

```bash
cd python && python3 -m unittest discover -s tests -t .
```

`tests/test_worker.py` — нагрузка против фейкового агента по `socket.socketpair()`:
регистрация, итог, ошибки, отмена, остановка, drain, загрузка со свежей ссылкой.
