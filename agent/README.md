# Агент

Долгоживущий процесс на узле (сервер, VM, контейнер), связанный с бэкендом протоколом
**ALP** ([protocol/alp/v1](../protocol/alp/v1/README.md)). Один агент на узел:
держит связь, работает автономно при её потере, выполняет задачи нагрузками,
команды и желаемое состояние, шлёт статус и метрики, обновляет себя.

```
agent/
├── cmd/agent/          # Стандартный агент шаблона: run | version | keygen | boot-guard | release-manifest
├── kit/                # Пакеты — из них собирается любой агент проекта
│   ├── alp/            # Протокол: конверт, сообщения (тест на эталонах protocol/alp/v1/fixtures)
│   ├── link/           # Связь: WebSocket, HTTP sync, переподключение, классы доставки, коды закрытия
│   ├── outbox/         # Журнал надёжных сообщений на диске (до подтверждения сервером)
│   ├── stream/         # Поток: seq в пределах запуска, буфер неподтверждённого
│   ├── runtime/        # Оркестратор: возможности, status/metrics, drain, остановка
│   ├── jobs/           # Возможность jobs: назначения, слоты, исполнители (Runner), Go-обработчики
│   ├── workload/       # Нагрузки: дочерние процессы, IPC (fd 3), backoff, замена без простоя
│   ├── commands/       # Возможность commands: белый список, вывод потоком, итог надёжно
│   ├── state/          # Возможность state: снимок домена, кэш на диске, Reconciler
│   ├── telemetry/      # Хост (gopsutil) и GPU (nvidia-smi)
│   ├── update/         # Самообновление: sha256 + подпись Ed25519, .prev, откат (boot guard)
│   ├── identity/       # Регистрация по токену, учётные данные (0600)
│   ├── config/         # YAML с ${ENV} + AGENT_*
│   ├── logx/, backoff/ # Лог (slog + кольцевой буфер), задержки повторов
│   └── app/            # Сборка агента из пакетов; проект добавляет свои возможности
├── install/            # install.sh + agent.service (systemd)
├── agent.dev.yaml      # yarn agent
├── agent.docker.yaml   # Dockerfile.agent
└── VERSION             # Версия сборки (-X main.version)
```

## Модель

- **Связь открывает агент**: WebSocket `/api/v1/agent-link`, при отказе upgrade
  (прокси) — HTTP sync; через 10 минут — снова WebSocket. Коды закрытия: 1012 —
  быстро переподключиться, 4401 — повторная регистрация (если есть токен), 4409 —
  ждать обновления, 4410 — вытеснен другой сессией, пауза.
- **Классы доставки**: поток (`status`, `metrics`, прогресс, вывод команд) — `seq` и
  буфер в памяти; надёжные (итоги задач, события, итоги команд, `state.applied`) —
  `outbox` на диске до `ack`; запросы (`job.urls`) — ответ по `re`.
- **Автономность**: без связи задачи продолжаются, итоги копятся в `outbox`; при
  переподключении `hello.jobs` перечисляет и задачи с недоставленным итогом.
- **Нагрузки** — дочерние процессы из `workloads`: канал IPC (unix socketpair, fd 3),
  нагрузка регистрирует очереди, агент суммирует слоты и раздаёт задачи; упавшая
  нагрузка — её задачи проваливаются с `WORKLOAD_CRASHED`, процесс перезапускается
  с backoff; `workload.restart` — замена без простоя.
- **Остановка** (SIGTERM): drain → нагрузки дорабатывают задачи (`stopTimeout`) →
  последний статус и досылка итогов → выход.

## Конфигурация

YAML (`-config`, `AGENT_CONFIG`) с подстановкой `${ENV}`, поверх — переменные:

| Ключ                 | Переменная                  | По умолчанию     | Что                                                                  |
| -------------------- | --------------------------- | ---------------- | -------------------------------------------------------------------- |
| `server.url`         | `AGENT_SERVER_URL`          | —                | адрес API (`https://…`)                                              |
| `server.transport`   | `AGENT_TRANSPORT`           | `auto`           | `auto` (WS → HTTP) \| `ws` \| `http`                                 |
| `dataDir`            | `AGENT_DATA_DIR`            | `/var/lib/agent` | учётные данные, outbox, кэш состояния                                |
| `name`               | `AGENT_NAME`                | hostname         | имя агента                                                           |
| `labels`             | `AGENT_LABELS` (`k=v,…`)    | —                | метки                                                                |
| `enroll.token`       | `AGENT_ENROLL_TOKEN`        | —                | токен регистрации (до первой регистрации)                            |
| `log.level`/`format` | `AGENT_LOG_LEVEL`/`…FORMAT` | `info`/`text`    | лог в stderr (`json` — для журналов)                                 |
| `telemetry.gpu`      | `AGENT_GPU`                 | `auto`           | `auto` (nvidia-smi, если есть) \| `off`                              |
| `update.mode`        | `AGENT_UPDATE_MODE`         | `self`           | `self` (systemd) \| `external` (контейнер) \| `disabled`             |
| `update.publicKey`   | `AGENT_UPDATE_PUBLIC_KEY`   | —                | ключ проверки подписи релизов (base64 Ed25519)                       |
| `workloads[]`        | —                           | —                | `name`, `command`, `dir`, `env`, `replicas`, `queues`, `stopTimeout` |

## Разработка

Go на машине не нужен — команды идут в контейнере `golang` (`scripts/agent.sh`):

```bash
yarn agent:go test      # тесты (и на эталонах протокола)
yarn agent:go race      # с race-детектором
yarn agent:go vet | fmt | tidy
yarn agent:go build [os] [arch]   # agent/dist/<VERSION>/agent-<os>-<arch>
yarn agent:setup && yarn agent    # агент на этой машине с Python-нагрузкой
```

## Поставка

- **Контейнер** — `Dockerfile.agent` (агент + Python-нагрузки, `update.mode=external`),
  профиль `agent` в `docker-compose.yml`; учётные данные и outbox — в томе
  `/var/lib/agent`. Обновление — новым образом.
- **Сервер без Docker** — `sudo sh agent/install/install.sh --binary agent-linux-amd64
--server https://api… --token … --public-key …`: `/opt/agent/bin/agent`, конфигурация
  `/etc/agent/agent.yaml`, секреты `/etc/agent/agent.env` (0600), служба `agent`
  (`Restart=always`, `KillMode=mixed`). `--uninstall [--purge]` — удаление.

## Обновление и подпись

1. Ключи: `agent keygen` → `AGENT_SIGNING_KEY` (секрет CI/выпуска, вне бэкенда) и
   `AGENT_UPDATE_PUBLIC_KEY` (в конфигурацию агентов).
2. Сборка: `AGENT_SIGNING_KEY=… yarn agent:go release` — linux/darwin × amd64/arm64 и
   подписанный `manifest.json` в `agent/dist/<VERSION>/`. Образ API собирает их сам
   (стадия `agent-dist`, секрет BuildKit `agent_signing_key`) и раздаёт из
   `AGENT_RELEASES_DIR`.
3. `POST /api/v1/agents/{id}/update` — команда `agent.update` со сборкой под ОС и
   архитектуру агента. Агент сверяет подпись и sha256, сохраняет прежнюю версию
   (`.prev`), подменяет себя и перезапускается после доработки задач.
4. Новая версия, не вышедшая на связь за 3 запуска, откатывается: под systemd это
   делает прежняя версия до запуска новой (`agent.prev boot-guard`), иначе — сам
   процесс при старте.

## Свой агент проекта

Проект с собственной возможностью (желаемое состояние узла, свои команды, задачи на
Go) собирает свой `cmd/<name>` из `kit/app` — без копирования связи и инфраструктуры:

```go
agent, err := app.New(cfg, version)
// Желаемое состояние домена: снимок с сервера → Apply на узле (идемпотентно).
agent.State().Register(wg.NewReconciler(agent.Log()))
// Своя команда из белого списка.
agent.Commands().Register("wg.restart", wg.RestartCommand)
// Задачи на Go в процессе агента.
funcs := jobs.NewFuncs("go", agent.Jobs())
funcs.Handle("node.probe", 4, probe)
agent.Jobs().Attach(funcs)
err = agent.Run(ctx)
```

На сервере домен регистрирует `asAgentStateProvider` (снимок для агента и реакция на
`state.applied`) — модуль `agent` доставляет его по протоколу.
