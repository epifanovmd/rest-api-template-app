# Папка агента

Всё, что агент делает на машине разработчика, на узлах и в контейнере, — здесь: программа агента,
её настройки и воркеры проекта. Сам агент — отдельный проект
([github.com/epifanovmd/agent](https://github.com/epifanovmd/agent)); здесь — то, что запускает на
нём этот бэкенд.

```
agent/
├── agent               программа агента (не в git: yarn agent скачивает её сам, yarn agent upgrade обновляет)
├── agent.yaml          машина разработчика — yarn agent
├── agent.prod.yaml     боевые узлы: поверх agent.yaml (экземпляр rest, пакеты, адрес и токен — от установки)
├── agent.docker.yaml   контейнер: поверх agent.prod.yaml
├── .env.prod.example   образец .env.prod — если узел ставится не с API
├── workers/            воркеры проекта: каждый — папка (echo — пример)
├── docker/Dockerfile   образ агента
├── dev.mjs             yarn agent*: программа агента, порт и токен API из .env.development
├── bundle/             архивы для узлов (yarn agent:pack, не в git) — их раздаёт API
└── dist/               сборки агента для сквозных тестов (yarn agent:fetch, не в git)
```

## Кто есть кто

- **Агент** — одна программа на узле. Подключается к бэкенду, запускает воркеры, передаёт им
  запросы и настройки, а бэкенду — их события и метрики. Что делают воркеры, агент не знает.
- **Воркер** — небольшой сервис, который делает работу на узле. Воркеры проекта — папки в
  `workers/`: база `agent_worker.py` (весь протокол агента) и класс-наследник с кодом воркера.
- **Настройки** — `agent.yaml` и файлы поверх него (`extends`): что запускать и как. Итог и
  откуда каждое значение — `yarn agent config check` (или `--env prod`).

## Агент на своей машине

```bash
yarn dev                          # API (в .env.development — AGENT_BOOTSTRAP_TOKEN)
yarn agent                        # агент с воркерами echo и netprobe (agent.yaml); Ctrl+C — остановка
yarn agent:start | agent:stop [--force] | agent:status | agent:logs   # то же в фоне
yarn agent config check           # итоговые настройки и откуда каждое значение
yarn agent worker list            # воркеры: откуда каждый, версия
yarn agent upgrade --check        # есть ли новая версия агента (yarn agent upgrade — поставить)
```

`yarn agent` (это `agent/dev.mjs`) скачивает программу агента той же версии, что `agent-sdk` в
`package.json`, если её ещё нет, берёт `SERVER_PORT` и `AGENT_BOOTSTRAP_TOKEN` из
`.env.development` (другой файл — `ENV_FILE=…`) и запускает `agent/agent run`. Воркер `echo` идёт
прямо из `workers/echo` (правки видны после перезапуска воркера), `netprobe` агент берёт из своего
релиза сам. Данные агента — `.agent/data` (удалить — агент зарегистрируется заново и привяжется к
своему узлу по имени). Второй агент — `AGENT_DIR=.agent-2 AGENT_NAME=dev-2 yarn agent`.

## Свой воркер

```bash
yarn agent worker new report      # agent/workers/report: база, класс Report, run, VERSION + строка в agent.yaml
```

```python
# agent/workers/report/worker.py — только код воркера
from agent_worker import Config, Worker, job, route

class Report(Worker):
    description = "Отчёты"
    settings = Config("settings", schema={"type": "object"}, default={"limit": 10})
    events = {"report.sent": {"type": "object"}}

    @route("POST", "/reports/{id}/send")
    def send(self, req):
        self.emit("report.sent", {"id": req.params["id"]})
        return {"ok": True}

    @job("report.build", schema={"type": "object"})
    def build(self, job):
        job.progress(0.5, "половина")
        return {"rows": self.settings.value["limit"]}

if __name__ == "__main__":
    Report().run()
```

Всё, что нужно агенту, база делает сама: сокет, `GET /health` (с `busy`, пока идут задачи),
`GET /manifest` из объявлений и `VERSION`, настройки, задачи (ход, отмена, повтор `jobId`,
продолжение после перезапуска — `resumable=True` и `WORKER_STATE_DIR`), события, запросы к бэкенду
(`self.ask`), метрики, уборку. Базу не правят: `yarn agent worker sync` обновит её до версии
агента. Полный пример — `workers/echo/worker.py`.

- **Манифест — всё, что воркер умеет.** Агент пропускает только объявленное: маршруты (`@route`),
  задачи (`@job`), события (`events`), запросы к бэкенду (`requests`), ключи настроек (`Config`);
  по схемам бэкенд проверяет тела и `data`.
- **Работа для воркера** — задача его типа: бэкенд ставит её очередью (`definition.job.type`) — см.
  README модуля [agent](../src/modules/agent/README.md#своя-очередь-задач-и-воркер).
- **Запрос к бэкенду** (`self.ask(type, data)`) — ответ даёт обработчик в модуле-владельце:
  `asWorkerRequestHandler(Класс)` — см. README модуля
  [agent](../src/modules/agent/README.md#запросы-воркеров-к-серверу).
- **Версия** — файл `VERSION` воркера. Новая версия — поднять `VERSION`, `yarn agent:pack` (или новый
  образ API) и `POST /api/v1/agents/{id}/workers/<имя>/update`: если воркер занят долгой задачей,
  замена ждёт её окончания (`deferred: true`, итог — событие `agent:action` в сокете).

## Как агент попадает на узел

Принцип один — вручную и с API: архив папки агента под машину узла и `agent install` из него.

```bash
yarn agent:pack                   # agent/bundle: agent-prod-<версия>-linux-{amd64,arm64}.tar.gz и release/
```

`agent pack --env prod` кладёт в архив программу агента под платформу узла, `agent.yaml` +
`agent.prod.yaml`, воркеры проекта и их подписанные сборки (`release/`), `netprobe` из релиза
агента. `agent install` на узле ставит агента службой: один файл настроек, воркеры — в каталог
данных, пакеты из `install:` (`python3`), экземпляр `rest` — своя служба `agent-rest` рядом с
агентами других бэкендов. Адрес API и токен регистрации передаёт установка.

| Как                  | Что сделать                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| вручную, архивом     | `scp agent/bundle/agent-prod-…-linux-amd64.tar.gz узел:` → `tar xzf … && cd agent && sudo ./agent install --server https://<api> --token <токен>`                               |
| одной командой с API | `POST /api/v1/nodes/{id}/install-command` (или `/api/v1/agent-releases/install-command`) → `curl -fsSL https://<api>/api/v1/agent-bundle/install.sh \| sudo sh -s -- --token …` |
| с API по SSH         | `POST /api/v1/nodes/{id}/agent/install` — то же самое на узле, токен — файлом                                                                                                   |
| удалить              | `sudo agent-rest uninstall [--purge]`, тем же скриптом `… \| sudo sh -s -- --uninstall [--purge]` или `POST /api/v1/nodes/{id}/agent/uninstall`                                 |

API раздаёт архивы из `AGENT_BUNDLE_DIR` (`/api/v1/agent-bundle/install.sh` и
`/api/v1/agent-bundle/linux-<arch>.tar.gz`); в образе API их собирает стадия `agent-bundle`
`Dockerfile`, для разработки — `yarn agent:pack` (`AGENT_BUNDLE_DIR=agent/bundle`).

На узле (экземпляр `rest`):

| Что               | Где                                                       |
| ----------------- | --------------------------------------------------------- |
| программа         | `/opt/agent-rest/bin/agent` (ссылка — `agent-rest`)       |
| настройки и токен | `/etc/agent-rest/agent.yaml`, `/etc/agent-rest/agent.env` |
| данные и воркеры  | `/var/lib/agent-rest`                                     |
| служба            | `agent-rest` (`systemctl status agent-rest`)              |

Команды на узле: `sudo agent-rest status`, `sudo agent-rest logs -f`, `sudo agent-rest upgrade`,
`sudo systemctl reload agent-rest` (перечитать настройки).

## Обновления и подписи

- **Агента и `netprobe`** бэкенд берёт из релизов GitHub `epifanovmd/agent` сам (`AGENT_RELEASES_*`)
  и замечает новые версии; агент на узле тоже сам проверяет новые версии и сообщает о них.
  Обновить — `POST /api/v1/agents/{id}/update` или `sudo agent-rest upgrade` на узле. Пересобирать
  бэкенд ради новой версии агента не нужно.
- **Воркеры проекта** подписывает `agent pack` ключом проекта из `AGENT_SIGNING_KEY` (пара — `yarn
agent keygen`). Открытый ключ попадает в архив, и `agent install` добавляет его к ключам узла.
  Без ключа воркеры ставятся, но с API не обновляются.

| Где собираются архивы          | Как передать закрытый ключ                              |
| ------------------------------ | ------------------------------------------------------- |
| `yarn agent:pack`              | `AGENT_SIGNING_KEY=… yarn agent:pack`                   |
| образ в CI (`release.yml`)     | секрет репозитория `AGENT_SIGNING_KEY`                  |
| образ на хосте (`make deploy`) | файл с ключом на хосте, путь — `AGENT_SIGNING_KEY_FILE` |
| `docker build`                 | `--secret id=agent_signing_key,env=AGENT_SIGNING_KEY`   |

## Docker

```bash
docker build -f agent/docker/Dockerfile -t agent .
docker compose --profile agent up -d    # агент рядом с API из docker-compose.yml
```

Образ — та же папка агента: `agent run --env docker` (`agent.docker.yaml` поверх `agent.prod.yaml`),
данные — том `/var/lib/agent`. В контейнере агент себя не обновляет — обновляют образ.

## Несколько копий бэкенда

Агент подключён к одной копии API. Если копий несколько, задайте всем один
`AGENT_RELAY_SECRET`: копия без соединения агента пересылает вызов той, у которой оно
есть, на её внутренний сервер пересылки — отдельный порт `AGENT_RELAY_PORT` (8182) на
адресе `AGENT_RELAY_HOST` (`127.0.0.1`; в контейнере — `0.0.0.0`). Внутренний адрес копии
— `INSTANCE_URL` или `AGENT_RELAY_HOST:AGENT_RELAY_PORT`. Публичный порт API пересылку не
обслуживает; порт пересылки наружу не публикуют.
