# Модуль Node

Узлы — машины с агентами (agent-sdk, модуль `agent`). Узел хранит название,
описание, публичный адрес (`host`), владельца и создателя и id своего агента;
статус вычисляется по агенту (его воркерам и настройкам) и последней задаче
установки. Модуль привязывает агента к узлу при регистрации, ставит и удаляет агента
по SSH (`agent install` / `agent uninstall` через `install.sh`, задачи модуля `jobs`),
задаёт воркеру `netprobe` цели проверки сети и собирает матрицу связности из его
метрик, открывает маршруты агентов владельцу узла.

## Структура файлов

```
src/modules/node/
├── node.module.ts              # @Module: сущность, провайдеры, задачи, политики, комнаты
├── node.entity.ts              # Node (таблица nodes)
├── node.repository.ts          # список с именами владельца и создателя, агенты узлов
├── node.service.ts             # CRUD с областью «все / свои», владелец
├── node-view.service.ts        # сборка NodeDto: агент, статусы настроек, кандидаты обновления, задача
├── node-status.ts              # вычисление статуса и сводки настроек
├── node-agent.service.ts       # токен и команда установки, привязка и отвязка агента
├── node-provision.service.ts   # постановка задач установки и удаления по SSH
├── node-install.job.ts         # node.install-agent (Node-задача, tracked)
├── node-uninstall.job.ts       # node.uninstall-agent
├── ssh-runner.ts / ssh-plan.ts # ssh2: команды, загрузка файлов, план, sudo
├── node-secret-box.service.ts  # шифрование SSH-данных и токена в данных задачи
├── node-mesh.service.ts        # цели netprobe (настройка targets) и матрица связности из метрик
├── node-netprobe-sync.job.ts   # node.netprobe-sync (после изменений и cron */10)
├── node.listener.ts            # события узлов, агентов, задач → сокет и реакции
├── node-room.policy.ts         # комната node_<id>
├── node-job-access.policy.ts   # доступ к задачам scope node
├── node-agent-access.policy.ts # доступ к агенту узла (политика модуля agent)
├── node.access.ts / .permissions.ts / .errors.ts / .types.ts / .config.ts
├── dto/ events/ validation/
└── *.test.ts                   # юнит; node.repository.integration.test.ts — с Postgres
```

## Сущность Node (`nodes`)

| Поле                      | Тип                                 | Описание                                |
| ------------------------- | ----------------------------------- | --------------------------------------- |
| `id`                      | `uuid`                              |                                         |
| `name`                    | `varchar(120)`                      | название                                |
| `description`             | `text`, nullable                    |                                         |
| `host`                    | `varchar(255)`, nullable            | публичный адрес: SSH и проверка сети    |
| `ownerId`                 | `uuid`, nullable, FK users          | назначенный владелец (`SET NULL`)       |
| `createdById`             | `uuid`, nullable, FK users          | создатель или автор токена (`SET NULL`) |
| `agentId`                 | `varchar(64)`, nullable, уникальный | агент узла (id agent-sdk, без FK)       |
| `agentName`               | `varchar(128)`, nullable            | имя агента узла (остаётся без агента)   |
| `createdAt` / `updatedAt` | `timestamptz`                       |                                         |

Миграции — `1791475124953-Nodes`, `1791511700000-AgentWorkers` (id агента — строка).

## Статус (вычисляется)

| Статус         | Когда                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `provisioning` | последняя задача установки или удаления ждёт или выполняется                                                                                                                                           |
| `created`      | агента нет, задачи нет или она завершилась успешно («Ожидает агента»)                                                                                                                                  |
| `error`        | агента нет и последняя задача упала или отменена; или агент на связи, но воркер не зарегистрирован (`invalid`), упал (`backoff`, `stopped`), не в порядке (`health.ok: false`) или отказал в настройке |
| `offline`      | агент не на связи                                                                                                                                                                                      |
| `online`       | агент на связи и в порядке                                                                                                                                                                             |

Пояснение — `statusMessage` (шаг задачи, ошибка задачи, `Воркер X …`, `Настройка
воркер/ключ: …`). Провал
удаления при живом агенте статус не меняет: он виден в `job`. Последняя задача —
`JobRunRepository.findLatestByScopes` (scope `node`, очереди модуля).

Сводка настроек `config` — по статусам ключей настроек воркеров агента
(`agents.configStatus`): `error` — воркер отказал, `applying` — агент на связи и
версия ещё не применена, `awaitingAgent` — агента нет или он не на связи, а применить
есть что, `synced` — всё применено; `pending` / `failed` — ключи `воркер/ключ`.

`agent` в DTO — кратко: `online`, `revoked`, `version`, `address`,
`lastSeenAt`, `host {hostname, os, arch}`, `updateAvailable` (кандидат обновления
до новой версии), `workers [{name, state, version, healthy, busy}]`.

## Права (`NodePermissions`, группа «Узлы»)

`node:view`, `node:update`, `node:delete`, `node:assign`, `node:provision`,
`node:agent`, `node:logs` — с областью (`…:own`: владелец или создатель);
`node:create` — без области. По умолчанию — только у admin (через `*`).
Невидимый узел — 404, видимый без права на действие — 403.

## REST (jwt, под `/api/v1`)

| Метод  | Путь                             | operationId                      | Право                |
| ------ | -------------------------------- | -------------------------------- | -------------------- |
| GET    | `/nodes?query&mine&offset&limit` | `GetNodes`                       | `node:view:own`      |
| GET    | `/nodes/options?mine`            | `GetNodeOptions`                 | `node:view:own`      |
| GET    | `/nodes/mesh`                    | `GetNodeMesh`                    | `node:view:own`      |
| GET    | `/nodes/{id}`                    | `GetNodeById`                    | `node:view:own`      |
| POST   | `/nodes`                         | `CreateNode` (201)               | `node:create`        |
| PATCH  | `/nodes/{id}`                    | `UpdateNode`                     | `node:update:own`    |
| DELETE | `/nodes/{id}`                    | `DeleteNode` (204)               | `node:delete:own`    |
| POST   | `/nodes/{id}/assign`             | `AssignNodeOwner`                | `node:assign:own`    |
| POST   | `/nodes/{id}/unassign`           | `UnassignNodeOwner`              | `node:assign:own`    |
| POST   | `/nodes/{id}/install-command`    | `CreateNodeInstallCommand` (201) | `node:provision:own` |
| POST   | `/nodes/{id}/agent/install`      | `InstallNodeAgent` (202)         | `node:provision:own` |
| POST   | `/nodes/{id}/agent/uninstall`    | `UninstallNodeAgent` (202)       | `node:provision:own` |

Создание с владельцем, отличным от себя, — только с `node:assign`. Удаление узла
отзывает и удаляет его агента (программа на машине остаётся — её удаляет задача
удаления). Ошибки: `NODE_NOT_FOUND` 404, `NODE_FORBIDDEN` 403, `NODE_USER_NOT_FOUND`
404, `NODE_JOB_RUNNING` 409, `NODE_HOST_REQUIRED` 400.

## Агент узла

**Команда установки.** `install-command` создаёт одноразовый токен регистрации
(`maxUses: 1`, срок `expiresInMinutes`, по умолчанию сутки) с меткой
`nodeId=<id узла>` и строку `curl …/api/v1/agent-link/install.sh | sudo sh -s --
--instance 'rest' --token … --worker 'netprobe'` (`agents.installCommand`; воркеры с
сервера — `workers`, по умолчанию воркер проверки сети `netprobe`). Токен — только в ответе.

**Экземпляр агента.** Агент проекта ставится на узел отдельным экземпляром
`AGENT_INSTANCE` (по умолчанию `rest`; пусто — экземпляр по умолчанию): служба
`agent-rest`, настройки `/etc/agent-rest`, данные и воркеры `/var/lib/agent-rest`,
программа `/opt/agent-rest/bin/agent`. Агенты других бэкендов на том же узле не мешают,
удаление затрагивает только свой экземпляр. На узле: `sudo agent-rest status`,
`sudo systemctl reload agent-rest`, `sudo agent uninstall --instance rest [--purge]`.

**Привязка.** Модуль `agent` выполняет запрос регистрации в своём контексте: хук
`enroll` запоминает источник (id токена, автор, метки токена — только выданные
сервером), и новый агент приходит событием `AgentEnrolledEvent(agent, source)`.
`NodeListener` → `NodeAgentService.onEnrolled`: метка `nodeId` — агент
привязывается к узлу (прежний агент узла отзывается). Без метки (общий токен
окружения или токен без узла; агент переустановлен или зарегистрировался заново,
удалив свои данные) — сначала ищется узел **без агента**, однозначно подходящий агенту
по порядку: прежнее имя агента узла (`agentName`) = имя агента, затем имя узла = имя
агента, затем `host` узла = адрес агента; подходят несколько — без угадывания. Найден —
агент привязывается к нему (условно: только если у узла всё ещё нет агента); иначе
создаётся узел с именем агента, владелец и создатель — автор токена (нет или удалён —
без владельца). У привязанного узла запоминается `agentName`. Отзыв агента
(`AgentUpdatedEvent` с `revoked`) и удаление (`AgentDeletedEvent`) — `agentId = null`,
`agentName` остаётся. Миграция `NodeAgentName` заполняет `agentName` именами агентов,
привязанных на момент миграции. Зависимость односторонняя: `node` → `agent`.

**Доступ к маршрутам агентов.** `NodeAgentAccessPolicy` — политика
`AGENT_ACCESS_POLICY` модуля `agent`: агент узла доступен с правом узла на
действие — просмотр (`view`: карточка, метрики, события, настройки, комната
`agent_<id>`) — `node:view`; журнал — `node:logs`; обновление агента, смена ключа,
перезапуск и обновление воркеров, их настройки и запросы к ним — `node:agent`.
Область `:own` — только агенты своих узлов; агенты без узла, отзыв и удаление
агента — только с `agent:manage` (с `node:agent` — 403).

## SSH: установка и удаление

`POST …/agent/install` / `…/agent/uninstall` с `{host?, port?, username?,
password?, privateKey?, passphrase?, sudo?, backendUrl?}` (+ `workers` / `purge`):
нужен пароль или ключ; `host` — по умолчанию адрес узла; `sudo` — по умолчанию,
если пользователь не root; `backendUrl` — адрес сервера, доступный с узла (по
умолчанию `AGENT_PUBLIC_URL`, иначе `APP_PUBLIC_URL`). Ответ — `202 {jobId}`.

Постановка (`NodeProvisionService`): пароль, ключ, passphrase и (для установки)
одноразовый токен с меткой узла шифруются `NodeSecretBox` (AES-256-GCM,
`NODE_SECRETS_KEY`, без него — ключ, производный от `JWT_SECRET_KEY`) и только так
попадают в данные задачи; `singletonKey node-ssh:<id>` — одна задача на узел
(иначе 409); scope `node/<id>`, владелец — автор.

Задача (воркер, `tracked`, без повторов): подключение ssh2 → рабочий каталог
`mktemp -d /tmp/agent-node.XXXXXXXX` → токен файлом (umask 077) → установщик с
этого сервера (`/api/v1/agent-link/install.sh`, curl или wget) → `sh install.sh
--instance … --server … --token-file … --worker …` (удаление — `--instance …
--uninstall [--purge]`; экземпляр — `AGENT_INSTANCE` на момент постановки) с
`sudo -n` (вход по ключу) или `sudo -S` (пароль в stdin). Вывод команд — в журнал
задачи построчно, прогресс — по шагам; каталог удаляется и при сбое. Провал
установки отзывает токен; узел получает агента, когда тот зарегистрируется.
Успешное удаление отзывает и удаляет агента, узел — без агента.

Доступ к задачам узла (`NodeJobAccessPolicy`): видят — с `node:view`, отменяют —
с `node:provision` (`:own` — только своих узлов). Переходы статуса задачи → новый
`node:updated`; задача упала — статус `error`.

## Связность

Воркер `netprobe` из сборок агента (ставится на узел `agent install --worker
netprobe`, в dev — `agent/dev.sh`) проверяет связность до целей своей
настройки `targets` и отдаёт итог последнего круга в `GET /metrics`: агент кладёт его в
`metrics.workers.netprobe` — `{at, results: [{id, host, method, via?, sent, received,
lossPct, rttMinMs?, rttAvgMs?, rttMaxMs?, error?}]}`.

`NodeMeshService.syncTargets` (очередь `node.netprobe-sync`: после изменений узлов, при
появлении агента с воркером `netprobe`, `singletonKey`, и cron `*/10 * * * *`) задаёт
агенту каждого узла с воркером `netprobe` настройку `netprobe/targets`: `{targets:
[{id: <id узла>, host, method: "icmp"}], intervalSec: 30, count: 3, timeoutMs: 1000}` —
остальные узлы с адресом; новая версия — только при другом содержимом. Значение
проверяется по схеме из манифеста воркера.

Матрицу собирает модуль по последней точке метрик агентов узлов: ячейка «узел агента →
узел цели» — `{from, to, method, via?, sent, received, lossPct, rttAvgMs, rttMinMs,
rttMaxMs, at, stale, error?}`; `stale` — итог старше 2 мин или агент не на связи.
`GET /nodes/mesh` — в области просмотра (`:own` — между своими узлами). Новый итог в
метриках агента (`AgentMetricsReceivedEvent`, новое `at` у `netprobe`) — пересчёт не
чаще раза в 5 с: `node:mesh` целиком в комнату `nodes` и лично своим (владелец и
создатель с областью `own`) — матрица только по их узлам.

Нагрузка узла — точка метрик его агента без метрик воркеров: `node:load { nodeId,
agentId, point: { at, host } }` не чаще раза в 5 с на агента в комнаты `nodes`,
`node_<id>` и лично своим.

## Socket.IO

| Комната     | Вход                                                   | События                                                                 |
| ----------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `nodes`     | `room:subscribe {type: "nodes"}`, `node:view` (на все) | `node:updated` (NodeDto), `node:deleted {id}`, `node:mesh`, `node:load` |
| `node_<id>` | `room:subscribe {type: "node", id}`, `node:view(:own)` | `node:updated`, `node:deleted`, `node:load`, `job:updated` задач узла   |

Своим (владелец и создатель с областью `own`) `node:updated` / `node:deleted` /
`node:load` и `node:mesh` по своим узлам — лично (`OwnedEntityEmitter`); прежний владелец при смене получает `node:deleted`,
его комнаты пересматриваются. `node:updated` шлётся при изменении узла, привязке,
изменении агента (связь, версия, адрес, воркеры — без повторов), его проблем и
статусов настроек, переходе задачи установки.

## Конфигурация

`NODE_SECRETS_KEY` — ключ шифрования SSH-данных в задачах (32 байта hex/base64).

## Тесты

Юнит: статус и сводка, сервис (права «свои», 404/403, список), привязка агента (по
метке и без неё — по имени агента, имени узла, адресу),
SSH-план, раннер, задачи с моком SSH, цели и матрица, политика доступа к агентам, схемы.
Postgres (миграции узлов и агентов откатываются и применяются, `agentName` из прежних
привязок, выборки, узлы без агента для привязки, уникальность агента, последняя задача) — `TEST_DATABASE_URL=postgres://…/<база с test> yarn test:file
src/modules/node/node.repository.integration.test.ts`. E2E — `test/e2e/nodes.e2e.ts`
(настоящий агент с воркерами echo и netprobe: привязка по токену узла и по имени без
метки, доступ через узел, отзыв и удаление — только `agent:manage`, цели и матрица).
