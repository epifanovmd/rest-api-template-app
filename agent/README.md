# Агент на узлах

Здесь всё, что относится к агенту — программе, которая работает на каждой машине (узле) и
держит связь с бэкендом. Сам агент — отдельный проект
([github.com/epifanovmd/agent](https://github.com/epifanovmd/agent)); в этом репозитории —
то, что бэкенд отдаёт агентам: свои воркеры, их сборки и настройки для запуска на своей
машине и в Docker.

```
agent/
├── workers/        # воркеры проекта: каждый — своя папка (echo — пример)
│   └── echo/       # main.py, run (как запустить), VERSION (версия)
├── release.sh      # собирает воркеры проекта → agent/release
├── release/        # готовые сборки воркеров (не в git): их раздаёт API
├── fetch.mjs       # скачивает сборки агента с GitHub → agent/dist (yarn agent:fetch)
├── dist/           # скачанные сборки агента (не в git): для yarn agent и e2e
├── tools/          # утилита agent-release (не в git), если release.sh собрал её сам
├── dev.sh          # агент на своей машине (yarn agent)
├── local/          # настройки агента для yarn agent
└── docker/         # образ агента: Dockerfile и его настройки
```

## Кто есть кто

- **Агент** — одна программа на узле. Она подключается к бэкенду, запускает воркеры,
  передаёт им запросы и настройки, а бэкенду — их события и метрики. Что делают воркеры,
  агент не знает.
- **Воркер** — небольшой сервис, который делает полезную работу на узле (проверяет сеть,
  считает, собирает отчёт). Пишется на любом языке, без библиотек агента: это обычный
  HTTP-сервис. Воркеры проекта лежат в `agent/workers`.
- **Сборки агента** — программа агента под разные системы и воркер проверки сети
  `netprobe`. Их публикует проект агента на GitHub
  ([releases](https://github.com/epifanovmd/agent/releases)), подписывает своим ключом
  (ключ автора агента).
- **Сборки воркеров проекта** — папка `agent/release`: архивы воркеров из `agent/workers` и
  `manifest.json` со списком и контрольными суммами. Её раздаёт бэкенд
  (`AGENT_RELEASES_DIR`).

## Откуда бэкенд берёт агента

Бэкенд сам берёт агента и `netprobe` из релизов GitHub `epifanovmd/agent` — версии в
диапазоне `^1` (`AGENT_RELEASES_GITHUB`, `AGENT_RELEASES_RANGE`). Раз в час
(`AGENT_RELEASES_CHECK_INTERVAL_MS`) он проверяет, не вышла ли новая версия. Вышла — в
журнале запись, в сокете событие `agent:release`, а в `GET /api/v1/agent-releases` агенты
появляются среди тех, кого можно обновить. **Пересобирать бэкенд ради новой версии агента не
нужно**: бэкенд пересобирают, только когда меняется его код или воркеры проекта.

Узлы скачивают агента прямо с GitHub: бэкенд отвечает им ссылкой. Если у узлов нет доступа
к GitHub — `AGENT_RELEASES_PROXY=true`, и бэкенд отдаёт файлы сам. Взять агента не из
GitHub, а по ссылке на каталог одной версии (своё зеркало, закреплённая версия) —
`AGENT_RELEASES_URL`.

Бэкенд раздаёт итоговый набор сборок: агент и `netprobe` — из GitHub, воркеры проекта — из
`AGENT_RELEASES_DIR`.

## Сборки воркеров проекта

`yarn agent:release` (это `agent/release.sh`) собирает его в `agent/release`:

1. Упаковывает каждый воркер проекта (см. ниже).
2. Записывает `manifest.json` утилитой `agent-release` — только с воркерами, без агента.

Утилиту `agent-release` (той же версии, что `agent-sdk` в `package.json`) скрипт берёт из
`AGENT_RELEASE_TOOL` (готовая программа), из `agent/tools/agent-release-<версия>-<os>-<arch>`,
иначе запускает `go run github.com/epifanovmd/agent/cmd/agent-release@v<версия>` (так в
Docker и CI), а без Go на машине — собирает её в `agent/tools` в контейнере `golang` (нужен
Docker). Образ API собирает воркеры проекта сам (стадия `agent-release` в `Dockerfile`).

**Подпись.** Узел ставит обновление воркера, только если оно подписано ключом, которому
он доверяет. У агента несколько ключей проверки:

- **ключ автора агента** — им подписаны агент и `netprobe` на GitHub; он вшит в программу
  агента, а бэкенд вписывает его в `install.sh` (`AGENT_RELEASES_PUBLIC_KEY`, по умолчанию —
  ключ релизов `epifanovmd/agent`);
- **ключ проекта** — им подписаны воркеры проекта. Пара создаётся один раз:
  `agent-release keygen` (например, `agent/tools/agent-release-<версия>-<os>-<arch> keygen`)
  выдаёт `AGENT_SIGNING_KEY` (закрытый — только при сборке воркеров) и
  `AGENT_UPDATE_PUBLIC_KEY` (открытый — его указывают бэкенду, и `install.sh` передаёт его
  узлу).

Где нужен закрытый ключ проекта:

| Где собираются воркеры         | Как передать ключ                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `yarn agent:release`           | `AGENT_SIGNING_KEY=… yarn agent:release`                                                                 |
| образ в CI (`release.yml`)     | секрет репозитория `AGENT_SIGNING_KEY` и переменная `AGENT_UPDATE_PUBLIC_KEY`                            |
| образ на хосте (`make deploy`) | файл с ключом на хосте, путь — `AGENT_SIGNING_KEY_FILE`, и `AGENT_UPDATE_PUBLIC_KEY` в `.env.production` |
| `docker build`                 | `--secret id=agent_signing_key,env=AGENT_SIGNING_KEY --build-arg AGENT_UPDATE_PUBLIC_KEY=…`              |

Без ключа проекта воркеры проекта без подписи: установка сверит только контрольную сумму, а
обновить такой воркер с бэкенда не получится.

## Как агент попадает на узел

Файлы настроек из этого репозитория на узлы **не попадают**. На узле всё делает
установщик:

1. Бэкенд выдаёт команду установки одной строкой — в API это
   `POST /api/v1/nodes/{id}/install-command` (узел) или
   `POST /api/v1/agent-releases/install-command`:
   `curl -fsSL https://<бэкенд>/api/v1/agent-link/install.sh | sudo sh -s -- --instance rest --token … --worker netprobe`.
   Её выполняют на узле руками или бэкенд сам по SSH (`POST /api/v1/nodes/{id}/agent/install`).
2. `install.sh` скачивает с бэкенда программу агента под эту машину, сверяет контрольную
   сумму и запускает `agent install`.
3. `agent install` ставит агента службой, **сам создаёт его настройки**
   `/etc/agent-rest/agent.yaml` (адрес бэкенда, токен, воркеры), ставит воркеры с сервера и
   запускает агента. Агент регистрируется по токену и появляется в списке агентов.

**Свой экземпляр агента.** На одном узле могут работать агенты разных бэкендов. Поэтому
агент проекта ставится отдельным экземпляром — имя задаёт `AGENT_INSTANCE` бэкенда (по
умолчанию `rest`; пусто — обычный агент без имени). Бэкенд сам добавляет `--instance` в
команду установки и в установку и удаление по SSH. У экземпляра всё своё:

| Что                 | Где                                                       |
| ------------------- | --------------------------------------------------------- |
| программа           | `/opt/agent-rest/bin/agent` (ссылка — `agent-rest`)       |
| настройки и токен   | `/etc/agent-rest/agent.yaml`, `/etc/agent-rest/agent.env` |
| данные и воркеры    | `/var/lib/agent-rest`                                     |
| служба              | `agent-rest` (`systemctl status agent-rest`)              |
| пользователь службы | `agent-rest`                                              |

Команды на узле: `sudo agent-rest status`, `sudo agent-rest logs -f`,
`sudo systemctl reload agent-rest` (применить настройки). Удалить с узла:
`sudo agent uninstall --instance rest [--purge]` (или тот же `install.sh --instance rest
--uninstall`; в API — `POST /api/v1/nodes/{id}/agent/uninstall`). Агенты других экземпляров
это не затрагивает.

## Как воркеры проекта попадают на узлы

1. **Упаковка.** `agent/release.sh` берёт каждую папку `agent/workers/<имя>` с файлом
   `VERSION` и исполняемым `run` и упаковывает её в архив
   `<имя>-<версия>-<os>-<arch>.tar.gz` — по архиву на каждую систему (linux и darwin,
   amd64 и arm64; другой список — `AGENT_PLATFORMS`).
   Содержимое одинаковое (Python-воркеру неважна платформа), но агент ищет сборку под свою
   систему, поэтому архивов несколько. Архивы попадают в `manifest.json`.
2. **Установка.** В команде установки воркер называют: `--worker echo` (в API — поле
   `workers`). Установщик скачивает архив, распаковывает его в
   `/var/lib/agent-rest/workers/echo/current` и прописывает воркер в `agent.yaml` с
   `release: true`. Агент запускает `./run` из этой папки.
3. **Обновление.** Новая версия — поднять `VERSION`, пересобрать воркеры
   (`yarn agent:release` или новый образ API), перезапустить бэкенд с новыми сборками и вызвать
   `POST /api/v1/agents/{id}/workers/echo/update`. Если воркер занят долгой задачей,
   замена ждёт её окончания: ответ приходит сразу (`deferred: true`), итог — событием
   `agent:action` в сокете.

На узле нужна среда для воркера: для `echo` — `python3` (≥ 3.10). Пакеты можно поставить
той же командой (`packages` в команде установки).

## Свой воркер

1. Папка `agent/workers/<имя>` (имя — строчные латинские буквы, цифры и `-`):
   - сам сервис — на любом языке; обязательно отвечает на `GET /health` и
     `GET /manifest` на unix-сокете из `AGENT_WORKER_SOCKET` (пример — `echo/main.py`,
     полное описание — `sdk/docs/workers.md` в репозитории агента);
   - `run` — исполняемый файл, который запускает сервис (`#!/bin/sh` и `exec …`);
   - `VERSION` — версия, та же, что в ответе `GET /manifest`.
2. **Манифест — всё, что воркер умеет.** Агент пропускает только объявленное, остальное
   отклоняет сам, не беспокоя воркер:
   - `routes` — маршруты для запросов с бэкенда (`{ method, path, description?, request?,
response? }`, `{id}` в пути — один сегмент). Необъявленный путь бэкенд не отправит
     (ошибка `AGENT_ROUTE_UNDECLARED`). `request` — схема тела: бэкенд проверит тело до
     отправки (`AGENT_REQUEST_INVALID`), а экран «Запрос» построит по ней форму;
     `response` — описание ответа для людей;
   - `events` — типы событий воркера (`{ type, description?, schema? }`). Событие
     другого типа агент не примет (воркер получит `400 EVENT_UNDECLARED`); `data` не по
     `schema` бэкенд пометит замечаниями (`AGENT_VALIDATE_EVENTS`);
   - `jobs` — типы задач (`{ type, description?, schema? }`): задачу другого типа агент не
     пропустит (`AGENT_JOB_UNKNOWN`);
   - `requests` — запросы воркера к бэкенду (`{ type, description?, schema?, response? }`);
   - `configs` — ключи настроек со схемой значения.

   Пример целиком — `MANIFEST` в `echo/main.py`. Если воркер ещё не описал маршруты, узел
   может выключить их проверку для него — `routes: open` в его блоке `agent.yaml`
   (события, задачи по типу и запросы к бэкенду проверяются и тогда).

3. **Работа для воркера** — задача его типа: тип объявляется в манифесте (`jobs`), бэкенд
   ставит её очередью (`definition.job.type`) — см. README модуля
   [agent](../src/modules/agent/README.md#своя-очередь-задач-и-воркер).
4. **Запрос к бэкенду** — когда воркеру что-то нужно прямо сейчас (данные, решение):
   `POST /requests` с телом `{ type, data, timeoutMs? }` на сокет агента `AGENT_SOCKET`
   (заголовок `Authorization: Bearer $AGENT_WORKER_TOKEN`), тип — в `requests` манифеста.
   Ответ бэкенда — `200 { data }`; отказ — `422 { code, message }`; нет связи — `503`
   (повторить — дело воркера). На бэкенде ответ даёт обработчик в модуле-владельце:
   класс с `type` и `handle()`, регистрация `asWorkerRequestHandler(Класс)` — см. README
   модуля [agent](../src/modules/agent/README.md#запросы-воркеров-к-серверу). Пример —
   задача `echo.quick` с `lookup: true`: `echo` спрашивает префикс (`echo.lookup`), ответ
   даёт `DemoEchoLookupHandler` модуля задач.
5. Локально — строка в `agent/local/agent.yaml`, в образе — в `agent/docker/agent.yaml` и
   строка `COPY` уже покрывает `agent/workers`.
6. На узлы — новые сборки воркеров (`yarn agent:release` или новый образ API) и
   `--worker <имя>` в команде установки.

## Агент на своей машине

```bash
yarn dev              # API (в .env.development — AGENT_BOOTSTRAP_TOKEN и AGENT_RELEASES_DIR=agent/release)
yarn agent:release    # собрать воркеры проекта в agent/release (после изменений воркеров)
yarn agent            # агент с воркерами echo и netprobe; Ctrl+C — остановка
yarn agent:start | agent:stop [--force] | agent:status | agent:logs   # то же в фоне
```

`agent/dev.sh` берёт программу агента из `AGENT_BIN`, `.agent/bin/agent` или сборок агента
той же версии, что `agent-sdk`, в `agent/dist/v<версия>` (нет его — скачивает с GitHub:
`yarn agent:fetch`); воркер `echo` запускает прямо из `agent/workers/echo` (правки видны
после перезапуска воркера), `netprobe` — из тех же сборок агента (или `NETPROBE_BIN`). Настройки —
`agent/local/agent.yaml`, данные агента — `.agent/` (удалить — агент зарегистрируется
заново и привяжется к своему узлу по имени). Второй агент — `AGENT_DIR=.agent-2
AGENT_NAME=dev-2 yarn agent`.

## Docker

Образ агента с воркерами проекта и `netprobe`: `agent/docker/Dockerfile`, настройки внутри —
`agent/docker/agent.yaml`. Программа агента и `netprobe` — с GitHub Release агента версии
`AGENT_VERSION` (build-arg).

```bash
docker build -f agent/docker/Dockerfile -t agent .
docker compose --profile agent up -d    # агент рядом с API из docker-compose.yml
```

В контейнере агент себя не обновляет — обновляют образ.

## Несколько копий бэкенда

Агент подключён к одной копии API. Если копий несколько, задайте всем один
`AGENT_RELAY_SECRET`: копия без соединения агента пересылает вызов той, у которой оно
есть, на её внутренний сервер пересылки — отдельный порт `AGENT_RELAY_PORT` (8182) на
адресе `AGENT_RELAY_HOST` (`127.0.0.1`; в контейнере — `0.0.0.0`). Внутренний адрес копии
— `INSTANCE_URL` или `AGENT_RELAY_HOST:AGENT_RELAY_PORT`. Публичный порт API пересылку не
обслуживает; порт пересылки наружу не публикуют.
