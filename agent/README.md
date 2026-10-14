# Папка агента

Всё, что агент делает на машине разработчика, на узлах и в контейнере, — здесь: программа агента,
её настройки и воркеры проекта. Сам агент — отдельный проект
([github.com/epifanovmd/agent](https://github.com/epifanovmd/agent)); здесь — то, что запускает на
нём этот бэкенд.

```
agent/
├── agent               программа агента версии AGENT_VERSION (не в git: yarn agent скачивает её сам)
├── agent.yaml          машина разработчика — yarn agent
├── agent.prod.yaml     боевые узлы: поверх agent.yaml (экземпляр rest, пакеты, адрес и токен — от установки)
├── agent.docker.yaml   контейнер: поверх agent.prod.yaml
├── workers/            воркеры проекта: каждый — папка (echo — пример)
├── package/            файлы архива для получателя: Dockerfile, compose.yml, .env.example,
│                       .dockerignore, README.md
├── dev.sh              yarn agent*: программа агента, порт и токен API из .env.development
├── bundle/             архивы для узлов (yarn agent:pack / make agent-archive, не в git) — их раздаёт API
└── dist/               сборки агента для сквозных тестов (yarn agent:fetch, не в git)
```

## Кто есть кто

- **Агент** — одна программа на узле. Подключается к бэкенду, запускает воркеры, передаёт им
  запросы и настройки, а бэкенду — их события и метрики. Что делают воркеры, агент не знает.
- **Воркер** — небольшой сервис, который делает работу на узле. Воркеры проекта — папки в
  `workers/`: база `agent_worker.py` (весь протокол агента) и класс-наследник с кодом воркера.
- **Настройки** — `agent.yaml` и файлы поверх него (`extends`): что запускать и как. Итог —
  `yarn agent config check` (или `--env prod`).

## Агент на своей машине

```bash
yarn dev                          # API (в .env.development — AGENT_BOOTSTRAP_TOKEN)
yarn agent                        # агент с воркером echo (agent.yaml); Ctrl+C — остановка
yarn agent status                 # работает ли агент (запущенный в другом терминале)
yarn agent config check           # итоговые настройки
```

`yarn agent` (это `agent/dev.sh`) скачивает программу агента версии `AGENT_VERSION` (окружение или
`.env*`, образец — `.env.example`), если её нет или версия другая, берёт `SERVER_PORT` и `AGENT_BOOTSTRAP_TOKEN` из
`.env.development` (другой файл — `ENV_FILE=…`) и запускает `agent/agent run`; Ctrl+C останавливает агента вместе с
воркерами. Каталог сборок вместо релиза на GitHub — `AGENT_RELEASES_URL`. Воркеры проекта
идут прямо из `workers/` (правки видны после перезапуска воркера). Данные агента — `.agent/data` (удалить — агент зарегистрируется заново и привяжется к
своему узлу по имени). Второй агент — `AGENT_DIR=.agent-2 AGENT_NAME=dev-2 yarn agent`.

## Свой воркер

Новый воркер — папка `workers/<имя>` по образцу `workers/echo`: `agent_worker.py` (база, одна и та
же во всех воркерах проекта), `worker.py` (класс-наследник), `run` (`exec python3 …/worker.py`) и
`VERSION`; в `agent.yaml` — строка `- path: workers/<имя>` (с `env: { PYTHONUNBUFFERED: "1" }`).

```python
# agent/workers/report/worker.py — только код воркера
from agent_worker import Config, Worker, command

class Report(Worker):
    description = "Отчёты"
    settings = Config("settings", schema={"type": "object"}, default={"limit": 10})
    events = {"report.sent": {"type": "object"}}

    @command("report.send", schema={"type": "object", "required": ["id"]})
    def send(self, call):
        self.emit("report.sent", {"id": call.data["id"]})
        return {"ok": True}

    @command("report.build", resumable=True, busy=True)
    def build(self, call):
        call.progress(0.5, "половина")
        return {"rows": self.settings.value["limit"]}

if __name__ == "__main__":
    Report().run()
```

Всё, что нужно агенту, база делает сама: регистрацию с манифестом из объявлений и `VERSION`, поток
`GET /stream` (желаемое, команды, отмена), итоги команд (доставка с повтором), ход, пульс раз в 10 с
(с `busy`, пока идёт команда с `busy=True`, и метриками из `metrics()`), события, запросы к бэкенду
(`self.ask`), продолжение команд после перезапуска (`resumable=True` и `WORKER_STATE_DIR`), уборку
(`python3 worker.py cleanup` — файл `cleanup` воркера). Базу не правят по месту: изменение базы — во
всех воркерах сразу. Полный пример — `workers/echo/worker.py`.

- **Манифест — всё, что воркер умеет.** Агент пропускает только объявленное: команды (`@command`),
  события (`events`), запросы к бэкенду (`requests`), ключи настроек (`Config`). По схемам бэкенд
  проверяет аргументы команд (400 `AGENT_COMMAND_INVALID`), значения настроек
  (400 `AGENT_CONFIG_INVALID`), `data` запросов воркера (`REQUEST_INVALID`) и событий (не подошло —
  событие сохраняется с замечаниями `problems`).
- **Команда** — `POST /api/v1/agents/{id}/workers/<имя>/commands` `{type, args, waitSeconds}`: итог —
  в ответе, `GET /api/v1/agents/{id}/commands/{commandId}` и событие сокета `agent:command`.
- **Работа очередью** — внешняя задача: тип задачи — команда воркера, аргументы — `{jobId, data,
files}` (`call.data`, `call.files`), ход и итог — ход и итог команды; см. README модуля
  [jobs](../src/modules/jobs/README.md).
- **Запрос к бэкенду** (`self.ask(type, data)`) — ответ даёт обработчик в модуле-владельце:
  `asWorkerRequestHandler(Класс)` (пример — `src/modules/jobs/demo-echo-lookup.handler.ts`).
- **Версия** — файл `VERSION` воркера. Новая версия — поднять `VERSION`, `yarn agent:pack` (или новый
  образ API) и `POST /api/v1/agents/{id}/workers/<имя>/update`: занятый воркер агент заменит после
  окончания работы (`force: true` — сразу); итог — итог команды `worker.update`.

## Как агент попадает на узел

Принцип один — вручную, из веба и в CI: **архив агента** под машину узла. Он самодостаточен:
распаковал — и запускай как удобно (службой, на месте, в Docker).

```bash
make agent-archive                # = yarn agent:pack → agent/bundle: agent-prod-<версия>.tar.gz (linux amd64 и arm64) и release/
make agent-image                  # образ агента из архива под эту машину (его Dockerfile)
```

`agent pack --env prod` кладёт в один архив программы агента под все платформы (`bin/`, их выбирает
скрипт `agent` по `uname`), `agent.yaml` +
`agent.prod.yaml`, воркеры проекта (`echo`) и их подписанные сборки `release/`, `bundle.json`, а
по `pack.files` (`agent.prod.yaml`) — файлы получателя из `package/`: `Dockerfile` и `compose.yml` (агент из архива в контейнере),
`.env.example`, `README.md`, а также `agent.docker.yaml`. Секретов в общем архиве нет: адрес и
токен получатель кладёт в `agent/.env` (образец `.env.example`; его читают `envFiles` настроек и
`compose.yml`). Без адреса и токена агент не запустится (`server.required` агента): он скажет, чего
не хватает. Тот же архив собирает стадия образа API `agent-bundle` (раздаёт API) и CI (артефакт
сборки, файлы релиза GitHub и образ `…:<версия>-agent` из архива).
`agent install` на узле ставит агента службой: один файл настроек, воркеры — в каталог
данных, пакеты из `install:` (`python3`), экземпляр `rest` — своя служба `agent-rest` рядом с
агентами других бэкендов. Адрес API и токен регистрации передаёт установка.

Способ установки (поле `mode` в запросах команды и установки по SSH, флаг `agent install`):

| `mode`              | Что на узле                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `systemd` (обычный) | служба `agent-rest` от root, пакеты из `install:` ставятся                                                                                                                                                                                                         |
| `rootless`          | агент пользователя без root (`--rootless`, команда без `sudo`): `~/.agent-rest`, служба `systemctl --user` (её нет — установка не идёт: запускайте агента сами, `run`); `python3` должен уже стоять на узле                                                        |
| `run`               | без установки (`--run`, команда без `sudo`): агент на переднем плане — в контейнере или под своим менеджером процессов; данные — `AGENT_DATA_DIR` (по умолчанию `/var/lib/agent`, держите на томе), себя не обновляет. В образе должно быть то, что нужно воркерам |
| `docker`            | Docker Compose из архива (только команда, не SSH): архив под машину (`uname -m`), `.env` (0600) с адресом и токеном, `docker compose up -d --build` по `compose.yml` архива; нет `compose.yml` в архиве — 409 `AGENT_ARCHIVE_NO_COMPOSE`                           |

С `rootless` пакеты из `install:` пропускаются с предупреждением. Агент с `run` себя не обновляет:
с API «Обновить» ему недоступно, новая версия — при следующем запуске.

| Как                  | Что сделать                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| вручную, архивом     | `scp agent/bundle/agent-prod-….tar.gz узел:` → `tar xzf … && cd agent && cp .env.example .env` (адрес, токен) → `sudo ./agent install --env prod`, `./agent run --env prod` или `docker compose up -d --build` |
| архив с токеном      | веб: «Установить агента» → «Архив» (или `POST /api/v1/nodes/{id}/agent/issue/archive`): тот же архив и `.env` с одноразовым токеном; одноразовая ссылка — `…/issue/link`, только `.env` — `…/issue/env`        |
| одной командой с API | `POST /api/v1/nodes/{id}/install-command` (или `/api/v1/agent-enrollment/install-command`) → `curl -fsSL https://<api>/agent/v1/bundle/install.sh \| sudo sh -s -- --token …`                                  |
| с API по SSH         | `POST /api/v1/nodes/{id}/agent/install` — то же самое на узле, токен — файлом                                                                                                                                  |
| удалить              | `sudo agent-rest uninstall [--purge]` (без root — `agent-rest uninstall` без `sudo`), тем же скриптом `… \| sudo sh -s -- --uninstall [--purge]` или `POST /api/v1/nodes/{id}/agent/uninstall`                 |

API раздаёт архивы и установщик агента из `AGENT_BUNDLE_DIR` (`/agent/v1/bundle/install.sh` —
`install.sh` из релиза агента той же версии, `/agent/v1/bundle/agent.tar.gz` — новейший архив (все платформы),
`/agent/v1/releases/*` — каталог сборок воркеров `release/`);
в образе API их собирает стадия `agent-bundle` `Dockerfile`, для разработки — `yarn agent:pack`
(`AGENT_BUNDLE_DIR=agent/bundle`). Установщику передаются `--server <API>` и
`--bundle <API>/agent/v1/bundle/agent.tar.gz`.

На узле (экземпляр `rest`):

| Что               | Где                                                       |
| ----------------- | --------------------------------------------------------- |
| программа         | `/opt/agent-rest/bin/agent` (ссылка — `agent-rest`)       |
| настройки и токен | `/etc/agent-rest/agent.yaml`, `/etc/agent-rest/agent.env` |
| данные и воркеры  | `/var/lib/agent-rest`                                     |
| служба            | `agent-rest` (`systemctl status agent-rest`)              |

Команды на узле: `sudo agent-rest status`, `sudo agent-rest logs -f`, `sudo agent-rest upgrade`,
`sudo systemctl reload agent-rest` (перечитать настройки). Без root — то же без `sudo`, пути —
`~/.agent-rest/…`, служба — `systemctl --user … agent-rest`.

## Обновления и подписи

- **Агент** на узле сам проверяет новые версии в своём каталоге сборок (`update.releases`; по
  умолчанию — релизы GitHub `epifanovmd/agent`) и сообщает о них бэкенду (`updateAvailable` в
  карточке агента). Обновить — `POST /api/v1/agents/{id}/update`
  или `sudo agent-rest upgrade` на узле (агент с `run` — новым запуском). Пересобирать бэкенд ради
  новой версии агента не нужно.
- **Воркеры проекта** подписывает `agent pack` ключом проекта из `AGENT_SIGNING_KEY`.
  Открытый ключ попадает в архив, и `agent install` добавляет его к ключам узла. Без ключа воркеры
  ставятся, но с API не обновляются. Пара ключей — `openssl`:

  ```bash
  openssl genpkey -algorithm ed25519 -outform DER -out signing.der
  echo "AGENT_SIGNING_KEY=$(tail -c 32 signing.der | base64)"
  echo "AGENT_UPDATE_PUBLIC_KEYS=$(openssl pkey -inform DER -in signing.der -pubout -outform DER | tail -c 32 | base64)"
  ```

| Где собираются архивы          | Как передать закрытый ключ                              |
| ------------------------------ | ------------------------------------------------------- |
| `yarn agent:pack`              | `AGENT_SIGNING_KEY=… yarn agent:pack`                   |
| образ в CI (`release.yml`)     | секрет репозитория `AGENT_SIGNING_KEY`                  |
| образ на хосте (`make deploy`) | файл с ключом на хосте, путь — `AGENT_SIGNING_KEY_FILE` |
| `docker build`                 | `--secret id=agent_signing_key,env=AGENT_SIGNING_KEY`   |

## Выдача агента получателю

Ядро (`AgentIssueService`) выдаёт агента человеку, который запустит его сам:

| Что                | REST (`agent:enroll`; узла — `node:provision`)                                            | Получатель                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| архив с токеном    | `POST /api/v1/agent-enrollment/issue/archive`, `…/nodes/{id}/agent/issue/archive`         | распаковать → `docker compose up -d --build` или `sudo ./agent install --env prod` |
| одноразовая ссылка | `…/issue/link` → `GET /agent/v1/bundle/issued/{id}` один раз и до срока (потом 410)       | `curl -fsSL <ссылка> \| tar -xz && cd agent` → как выше                            |
| только `.env`      | `…/issue/env`                                                                             | положить как `agent/.env` общего архива или `--env-file` образа                    |
| варианты           | `GET /api/v1/agent-enrollment/install-options` — платформы архивов, есть ли `compose.yml` | —                                                                                  |

Архив с токеном — общий архив платформы и дописанный `agent/.env` (0600: адрес, одноразовый токен,
имя; для `http://` — `AGENT_SERVER_ALLOW_INSECURE`); на сервере он не хранится. Ссылка хранит только
параметры выдачи (`agent_issues`): токен создаётся при скачивании. Токен нужен только до первой
регистрации. Выдача — в журнале аудита (`agent.issue`).

## Docker

```bash
make agent-archive agent-image          # образ агента из архива под эту машину
docker compose --profile agent up -d    # агент рядом с API из docker-compose.yml (образ <тег>-agent)
```

Образ собирается только из архива — его `Dockerfile` (у получателя, в CI и `make agent-image`):
`./agent run --env docker` (`agent.docker.yaml` поверх `agent.prod.yaml`), данные — том
`/var/lib/agent`, токен — при запуске (`env_file`, в слои не попадает). В контейнере агент себя не
обновляет — обновляют архивом и образом.

## Несколько копий бэкенда

Поток агента (`GET /agent/v1/stream`) держит одна копия API; это записано в агенте
(`stream_instance`). Любая копия пишет желаемое и команды в БД и будит копию с потоком через
Postgres `NOTIFY agent_push`, итоги будят ждущих через `agent_result`. Поэтому команды, настройки и
задачи работают через любую копию, липкий балансировщик не нужен.
