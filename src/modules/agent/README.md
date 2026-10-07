# Модуль Agent

Агенты — долгоживущие процессы на узлах, связанные с бэкендом протоколом **ALP**
(`protocol/alp/v1/README.md`, эталоны — `fixtures/`). Модуль — серверная сторона
протокола: регистрация, канал (WebSocket и HTTP sync), сессии, присутствие,
команды, желаемое состояние, раздача сборок. Задачи и домены подключаются
возможностями (`asAgentCapability`, `asAgentStateProvider`); модуль о них не знает.

## Структура файлов

```
src/modules/agent/
├── agent.module.ts               # @Module: провайдеры, возможности, схема agent, cron, бутстрапер шлюза
├── agent-link.protocol.ts        # ALP: схемы входящих (zod), типы исходящих, коды закрытия, классы доставки
├── agent.capability.ts           # Контракт возможности: IAgentSession, IAgentCapability, asAgentCapability
├── agent-capability.registry.ts  # Тип сообщения → возможность (повтор и неописанный тип — ошибка старта)
├── agent-session.ts              # Сессия, независимая от транспорта: hello/welcome, поток/надёжные/запросы, ack
├── agent-session.hub.ts          # Сессии процесса; сигналы между процессами: доставка, вытеснение, отзыв
├── agent-link.gateway.ts         # WebSocket на /api/v1/agent-link: проверка до upgrade, ping/pong, отзыв
├── agent-sync.service.ts         # HTTP sync: пачки конвертов, long-poll, восстановление сессии в любом процессе
├── agent-link.controller.ts      # REST агента /api/v1/agent-link: enroll, sync, releases (схема agent)
├── agent.controller.ts           # REST /api/v1/agents (jwt): список, карточка, отзыв, команды, обновление
├── agent-command.controller.ts   # REST /api/v1/agent-commands (jwt): команда, отмена
├── agent-enrollment.controller.ts# REST /api/v1/agent-enrollment-tokens (jwt)
├── agent-release.controller.ts   # REST /api/v1/agent-releases (jwt)
├── agent.service.ts              # Учётные данные, сессии и присутствие в БД, offline, отзыв
├── agent-enrollment.service.ts   # Токены регистрации (и bootstrap-токен окружения), обмен на учётные данные
├── agent-command.service.ts      # Команды: белый список агента, жизненный цикл, таймауты, обновление
├── agent-commands.capability.ts  # Возможность commands: доставка pending, cmd.accept/output/done
├── agent-state.capability.ts     # Возможность state: снимки поставщиков доменов, state.applied
├── agent-release.service.ts      # Выпуски из AGENT_RELEASES_DIR: manifest.json, поток файла
├── agent-presence.store.ts       # Redis: последний status и metrics, номер потока, снимок сессии
├── agent-signals.ts              # LISTEN/NOTIFY: agent_signal (доставить), agent_session (вытеснить/отозвать)
├── agent.scheme.ts               # @Security("agent"): Authorization: Agent <id>.<secret>
├── agent-credentials.ts          # Формат и разбор учётных данных и токенов
├── agent-jobs.ts                 # agents.link-lost (отложенная), agents.sweep и agents.retention (cron)
├── agent.listener.ts, agent.socket-events.ts, agent-room.policy.ts   # Сокет: agents, agent_<id>
├── agent.entity.ts, agent-enrollment-token.entity.ts, agent-command.entity.ts
├── agent.errors.ts, agent.permissions.ts, agent.types.ts, agent.config.ts
├── dto/, validation/, events/
└── *.test.ts                     # Протокол на эталонах, сессия
```

## Сущности

- **Agent** (`agents`): `name`, `labels` (jsonb), `status` (`online`/`offline`),
  `ephemeral`, `secretHash` (sha256 секрета), `enrollmentTokenId`, `sessionId`
  (текущая сессия), `transport` (`ws`/`http`), `version`, `protocol`, `host` (jsonb),
  `capabilities` (jsonb: из `hello`, ёмкость очередей — из `status.capacity`),
  `remoteIp`, `connectedAt`, `lastSeenAt`, `revokedAt`. Индекс
  `IDX_AGENTS_STATUS_SEEN`.
- **AgentEnrollmentToken** (`agent_enrollment_tokens`): `name`, `prefix` (unique),
  `hash`, `labels`, `maxUses` (null — без ограничения), `uses`, `ephemeral`,
  `expiresAt`, `revokedAt`, `createdBy`.
- **AgentCommand** (`agent_commands`, FK на агента, CASCADE): `name`, `args`,
  `status` (`pending` → `running` → `succeeded` | `failed` | `timeout` | `cancelled`),
  `output` (хвост ≤ 256 КБ), `result`, `error`, `exitCode`, `timeoutSec`,
  `requestedBy`, `startedAt`, `finishedAt`.

## REST

| Метод | Путь                                                | Доступ                  | Описание                                                                      |
| ----- | --------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| POST  | `/api/v1/agent-link/enroll`                         | токен в теле, троттлинг | Регистрация: токен → 201 `{ agentId, secret }` (секрет — один раз)            |
| POST  | `/api/v1/agent-link/sync`                           | `agent`                 | HTTP sync: `{ sessionId, messages, waitSeconds }` → `{ sessionId, messages }` |
| GET   | `/api/v1/agent-link/releases/{version}/{os}/{arch}` | `agent`                 | Файл сборки для самообновления                                                |
| GET   | `/api/v1/agents`                                    | `agent:view`            | Список (`status`, `offset`/`limit`)                                           |
| GET   | `/api/v1/agents/{id}`                               | `agent:view`            | Агент + `live`: последний `status` и `metrics`                                |
| POST  | `/api/v1/agents/{id}/revoke`                        | `agent:revoke`          | Отзыв (204): сессия закрывается 4401                                          |
| GET   | `/api/v1/agents/{id}/commands`                      | `agent:view`            | Команды агента                                                                |
| POST  | `/api/v1/agents/{id}/commands`                      | `agent:command`         | `{ name, args?, timeoutSec? }` → 201; имя — из белого списка агента           |
| POST  | `/api/v1/agents/{id}/update`                        | `agent:command`         | `{ version? }` → 201 команда `agent.update` со сборкой под ОС/архитектуру     |
| GET   | `/api/v1/agent-commands/{id}`                       | `agent:view`            | Команда: статус, вывод, итог                                                  |
| POST  | `/api/v1/agent-commands/{id}/cancel`                | `agent:command`         | Отмена (204); завершённая — 409                                               |
| GET   | `/api/v1/agent-releases`                            | `agent:view`            | Выпуски, новые первыми                                                        |
| POST  | `/api/v1/agent-enrollment-tokens`                   | `agent:enroll`          | `{ name, labels?, maxUses?, ephemeral?, expiresAt? }` → 201 `{ token }`       |
| GET   | `/api/v1/agent-enrollment-tokens`                   | `agent:enroll`          | Список (без секретов)                                                         |
| POST  | `/api/v1/agent-enrollment-tokens/{id}/revoke`       | `agent:enroll`          | Отзыв (204)                                                                   |

Канал WebSocket — `GET /api/v1/agent-link` (upgrade, вне спецификации):
подпротокол `alp.v1`, `Authorization: Agent <id>.<secret>`; отказ до upgrade —
401 (учётные данные), 426 (нет подпротокола). Агентское API (`/agent-link/*`)
отделено от администрирования (`/agents/*`).

## Канал и сессии

- `AgentSession` — одна сессия, транспорт за `IAgentTransport` (WebSocket или
  HTTP sync). Сообщения обрабатываются по порядку. `hello` — первым (иначе 4400),
  версия — наибольшая общая (`ALP_PROTOCOLS`, иначе 4409); `openSession` пишет в БД
  статус, сессию, версию, хост, возможности и шлёт сигнал `agent_session` — прежние
  сессии агента в любом процессе закрываются 4410.
- Классы доставки (`ALP_INCOMING`): поток — повтор `seq` (в пределах `bootId`,
  номер — в Redis) не обрабатывается, `ack{seq}`; надёжные — после обработки
  `ack{ids}`; ошибка — `error{re, code, retryable}` (4xx — без повтора, иначе —
  повторить); запросы — ответ с `re`. Подтверждения склеиваются (20 мс); ответ HTTP
  sync их не ждёт (`settle`).
- `status` → Redis (TTL — 3 интервала), `lastSeenAt` в БД не чаще 15 с (сессия
  вытеснена — 4410), `status.capacity` → возможности в БД; `metrics` → Redis.
  Оба — событие `AgentLiveEvent`.
- **HTTP sync**: исходящее копится до ответа, ожидание прерывает первое исходящее;
  сессия, которой нет в процессе, восстанавливается по снимку (Redis) при совпадении
  `agents.session_id` — без повторной сверки (`onResume`). Без обмена 90 с процесс
  её забывает.
- Поручения из любого процесса — сигнал `agent_signal '<agentId>'`: процесс с
  сессией вызывает `deliver` возможностей.

## Возможности

- **commands** (`AgentCommandsCapability`): `pending` команды — `cmd.run` при
  открытии и по сигналу (в сессии — без повторов; агент дедуплицирует), `cmd.accept`
  → `running`, `cmd.output` → хвост вывода, `cmd.done` → итог.
- **state** (`AgentStateCapability`): поставщики `asAgentStateProvider` (`domain`,
  `build(agentId)`, `onApplied`): `state.put`, если версия новее известной агенту
  (`hello.capabilities.state.domains` и отправленной). Изменение домена — сигнал
  `agent_signal`. В шаблоне поставщиков нет.
- **jobs** — в модуле `jobs` (`JobsAgentCapability`, см. его README).

## Присутствие

- Онлайн — с `hello`; разрыв WebSocket без новой сессии за `AGENT_OFFLINE_GRACE_SEC`
  → offline (задача `agents.link-lost`, только если сессия та же и пульса не было).
- Страховка — cron `agents.sweep` раз в минуту: без пульса 3 интервала — offline
  (процесс с сессией упал, HTTP-агент пропал); команды без итога дольше таймаута
  (+15 с) — `timeout`.
- `agents.retention` (сутки): завершённые команды старше 30 дней, эфемерные агенты
  без связи дольше суток.
- Отзыв: `revokedAt`, сигнал `agent_session '<id>:revoked'` → 4401; страховка —
  перепроверка агентов открытых сессий раз в минуту.

## Сокет

| EventBus                                                                                                            | Сокет           | Комната                                           |
| ------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------- |
| `AgentEnrolledEvent`, `AgentOnlineEvent`, `AgentOfflineEvent`, `AgentRevokedEvent`, `AgentCapabilitiesChangedEvent` | `agent:updated` | `agents` (право `agent:view`)                     |
| `AgentLiveEvent`                                                                                                    | `agent:live`    | `agent_<id>` (`room:subscribe { type: "agent" }`) |
| `AgentCommandUpdatedEvent`                                                                                          | `agent:command` | `agent_<id>`                                      |

## Конфиг

`AGENT_BOOTSTRAP_TOKEN` (≥ 32 символов, многоразовый токен окружения),
`AGENT_STATUS_INTERVAL_MS` (15000), `AGENT_METRICS_INTERVAL_MS` (15000),
`AGENT_HELLO_TIMEOUT_MS` (10000), `AGENT_PING_INTERVAL_MS` (20000),
`AGENT_OFFLINE_GRACE_SEC` (30), `AGENT_MAX_MESSAGE_BYTES` (4 МиБ),
`AGENT_RELEASES_DIR` (`agent/dist`). Секция `agent` (`defineModuleConfig`).

## Тесты

Юнит: протокол на эталонах `protocol/alp/v1/fixtures/a2s` (каждый тип принимается
схемой, у каждого есть эталон), сессия (рукопожатие, версии, дедупликация потока,
ack, ошибки, вытеснение, восстановление). E2E (`test/e2e/agents.e2e.ts`, настоящий
WebSocket и HTTP sync): регистрация, отказ upgrade, сессия и живое состояние,
задачи (раздача, прогресс, ссылки, итог, провал, отмена, сверка), команды,
вытеснение и отзыв, bootstrap-токен, выпуски и обновление.
