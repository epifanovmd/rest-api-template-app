# REST API Template

Шаблон серверного приложения на Node.js + TypeScript: модульный монолит с IoC,
версионированный REST API с генерацией маршрутов и OpenAPI из декораторов,
реляционная БД через ORM, real-time транспорт, очередь фоновых задач с внешними
воркерами, хранилище файлов по подписанным ссылкам и событийная модель между модулями.

Главная ветка — платформа без предметной области: пользователи и доступ, сессии,
2FA, биометрия и passkeys, профиль, файлы, задачи и агенты, почта, аудит,
API-ключи, реальное время. Предметные примеры — в ветках-примерах этого шаблона
(`example/*`): главная ветка плюс модули примера и их миграции. Новый проект
начинается с главной ветки или с подходящего примера.

##### Stack:

- TypeScript, Node.js >= 22.13 (Docker — 24 LTS)
- Koa (HTTP) + tsoa (маршруты и OpenAPI из декораторов)
- Inversify (DI)
- TypeORM + PostgreSQL
- pg-boss (очередь задач на Postgres, cron, outbox)
- Redis (лимиты, presence, отзыв токенов, кэши, адаптер Socket.IO)
- Socket.IO (real-time)
- S3-совместимое хранилище (AWS SDK; локально и в compose — SeaweedFS) или локальный диск
- Zod (валидация входа и конфигурации)
- pino (структурированное логирование), prom-client (метрики), Sentry (ошибки)
- Nodemailer + EJS (письма по локалям), sharp + ffmpeg (обработка медиа)
- Mocha + Chai + Sinon (юнит- и e2e-тесты)
- tsc (сборка), lefthook (git-хуки), ESLint 10 flat config + Prettier 3
- Агенты: агент и серверный SDK [github.com/epifanovmd/agent](https://github.com/epifanovmd/agent) — `agent-sdk` (Node); воркеры — HTTP-сервисы без SDK

### Architecture

Приложение — **модульный монолит**: одно приложение, изолированные модули с явными
границами, DI-контейнер как единственный способ связывания, события как единственный
способ реакции между модулями, токены-реестры как единственный способ расширения
ядра. Один образ запускается в роли API, воркера или обеих сразу.

```
src/
  main.ts / app.ts   ← точка входа и жизненный цикл (composition root)
  app.module.ts      ← корневой модуль: список всех модулей
  config.ts          ← валидированная конфигурация окружения
  core/              ← ядро: DI, модули, auth, ошибки, EventBus, контракты задач и хранилища, наблюдаемость
  common/            ← универсальные хелперы
  middleware/        ← сквозные HTTP-middleware
  data-source.ts     ← единственный DataSource (сущности — из модулей, миграции — из списка)
  routing/           ← сгенерированные маршруты и спецификация, swagger, системные пробы
  migrations/        ← миграции схемы БД и их упорядоченный список
  modules/           ← доменные и инфраструктурные модули
    <feature>/       ← entity · repository · service · controller · dto · validation · events · errors · jobs · module
templates/           ← ассеты рантайма вне кода (шаблоны писем по локалям); путь — от корня проекта
test/e2e/            ← интеграционный набор
agent/               ← всё про агента на узлах: воркеры проекта, их сборки, локальный запуск, образ (agent/README.md)
scripts/             ← генератор модуля
```

Документация:

- архитектурная модель, слои, границы, жизненный цикл, доступ, события, задачи,
  файлы, точки расширения — [ARCHITECTURE.md](ARCHITECTURE.md);
- памятка «что куда класть» — [MODULE-CHEATSHEET.md](MODULE-CHEATSHEET.md);
- правила написания кода — [CONVENTIONS.md](CONVENTIONS.md);
- принципы проектирования — [CLEAN-CODE.md](CLEAN-CODE.md) и
  [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md);
- агенты, своя очередь и воркер — [src/modules/agent/README.md](src/modules/agent/README.md);
  формат сообщений агентов — [sdk/spec/README.md](https://github.com/epifanovmd/agent/blob/main/sdk/spec/README.md).

Документация описывает общие принципы и не содержит описания конкретных модулей,
сущностей и эндпоинтов — они описаны в `README.md` каждого модуля. Документация
меняется только в исключительных случаях — когда меняется архитектура, принцип или
паттерн проекта.

### Requirements

- Node.js >= 22.13 (Docker — 24 LTS)
- Yarn >= 1.22
- Docker — для локальной инфраструктуры и e2e
- PostgreSQL 14+, Redis — обязателен в production; S3-совместимое хранилище — для
  `STORAGE_DRIVER=s3`

### Installation

```sh
git clone <repository-url>
cd <project-directory>
yarn
cp .env.example .env.development
docker compose -f docker-compose.dev.yml up -d   # Postgres, Redis, Mailpit, S3 (SeaweedFS)
```

В `.env.<NODE_ENV>` задаются параметры БД, секрет JWT, учётные данные администратора,
SMTP, хранилище и прочие переменные — их полный список с описанием в `.env.example`.
Читается `.env.<NODE_ENV>`, затем `.env` из корня проекта. Конфигурация валидируется
при старте: невалидные значения останавливают запуск. Скомпилированный запуск без
`NODE_ENV` работает как production; в production небезопасные умолчания (пустой
пароль БД, CORS `*`, отсутствие Redis, неполные ключи S3) — ошибка запуска.

Локальная инфраструктура (`docker-compose.dev.yml`): Postgres `:5432`, Redis `:6379`,
Mailpit (SMTP `:1025`, веб-интерфейс писем — http://localhost:8025), S3 `:8333`
(bucket-ы `rest-api` и `e2e` создаются автоматически). Для S3 локально:
`STORAGE_DRIVER=s3 S3_ENDPOINT=http://localhost:8333 S3_FORCE_PATH_STYLE=true
S3_BUCKET=rest-api S3_ACCESS_KEY_ID=storage S3_SECRET_ACCESS_KEY=storage12345`.
Без SMTP письма в development пишутся в лог.

### Run

```sh
yarn dev
```

`yarn dev` запускает процесс в роли `all`: HTTP, сокеты и выполнение задач в одном
процессе. При старте сервер применяет ожидающие миграции. API — `/api/v1/...`,
Swagger UI — `/api-docs` (в production — по `API_DOCS_ENABLED`). Системные маршруты:
`/ping` (liveness), `/ready` (readiness), `/health` (зависимости и проверки модулей),
`/metrics` (Prometheus, `METRICS_TOKEN` — Bearer-защита).

### Commands

Все команды — из корня репозитория.

**Разработка**

| Команда                 | Что делает                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `yarn dev`              | генерация маршрутов + сервер с перезапуском при изменениях (роль `all`, миграции при старте) |
| `yarn dev:types`        | проверка типов в режиме watch                                                                |
| `yarn dev:routes`       | перегенерация маршрутов и спецификации при изменении модулей                                 |
| `yarn gen:module <имя>` | каркас нового модуля по конвенциям (`--dry-run` — только список файлов)                      |

**Проверки**

| Команда                  | Что делает                                                               |
| ------------------------ | ------------------------------------------------------------------------ |
| `yarn lint` / `lint:fix` | ESLint (`src`, `test`) / с автоисправлением                              |
| `yarn prettier:fix`      | форматирование `src/**/*.ts`                                             |
| `yarn typecheck`         | проверка типов (`tsc --noEmit`)                                          |
| `yarn test`              | юнит-тесты (`src/**/*.test.ts`)                                          |
| `yarn test:file <путь>`  | один файл тестов                                                         |
| `yarn test:e2e`          | интеграционные тесты: настоящий сервер поверх Postgres, Redis, SMTP и S3 |
| `yarn outdated`          | устаревшие зависимости                                                   |

**Сборка, кодогенерация, база**

| Команда                                        | Что делает                                        |
| ---------------------------------------------- | ------------------------------------------------- |
| `yarn generate`                                | маршруты и OpenAPI из декораторов (`src/routing`) |
| `yarn build`                                   | генерация + компиляция `src/` → `build/`          |
| `yarn server`                                  | запуск production-сборки                          |
| `yarn migration:generate src/migrations/<Имя>` | миграция из разницы сущностей и схемы БД          |
| `yarn migration:run` / `migration:revert`      | применить ожидающие миграции / откатить последнюю |
| `yarn migration:run:prod`                      | применить миграции из `build/` (в контейнере)     |

**Агент на этой машине** — агент ([github.com/epifanovmd/agent](https://github.com/epifanovmd/agent))
с воркерами из `agent/local/agent.yaml`: `echo` (воркер проекта из `agent/workers/echo`,
Python на стандартной библиотеке) и `netprobe` (проверка сети, из сборок агента).
Регистрируется `AGENT_BOOTSTRAP_TOKEN` из `.env.development` (тот же токен у API), адрес
API — `http://localhost:$SERVER_PORT`. Программа агента — `AGENT_BIN`, `.agent/bin/agent` или
сборки агента версии `agent-sdk` в `agent/dist/` (нет — скачивается с GitHub). Бэкенд берёт
агента для узлов из релизов GitHub сам (`AGENT_RELEASES_*`) и замечает новые версии — ради
новой версии агента его не пересобирают. Как агент и воркеры попадают на узлы —
[agent/README.md](agent/README.md).

| Команда                     | Что делает                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `yarn agent`                | агент на переднем плане (Ctrl+C — остановка агента и воркеров)                             |
| `yarn agent:start`          | то же в фоне (данные, pid и журнал — `.agent/`; другой агент — `AGENT_DIR=… AGENT_NAME=…`) |
| `yarn agent:stop [--force]` | остановить агента и воркеры; `--force` — сразу                                             |
| `yarn agent:status`         | запущен ли агент                                                                           |
| `yarn agent:logs`           | журнал агента и его воркеров                                                               |
| `yarn agent:release`        | собрать воркеры проекта в `agent/release` (`AGENT_RELEASES_DIR`)                           |
| `yarn agent:fetch`          | скачать сборки агента с GitHub в `agent/dist/` (агент на этой машине, e2e)                 |

**Makefile — сервер по SSH** (настройки — `.env.deploy`, образец `.env.deploy.example`;
любое значение переопределяется в команде: `make deploy SSH_HOST=…`)

Обычная выкладка — push в `main`: CI проверяет код, собирает образы (воркеры проекта
подписаны ключом из секрета `AGENT_SIGNING_KEY`), отправляет их в ghcr с тегом коммита и
запускает на хосте `make release TAG=<sha>`; после выкладки `latest` указывает на этот
коммит. Хост только скачивает образы. Откат — `make release TAG=<sha прошлого коммита>`
или ручной запуск workflow Deploy с этим тегом. `make deploy` (сборка на хосте) — запасной
путь без CI; воркеры проекта в нём подписаны, только если на хосте есть файл ключа
(`AGENT_SIGNING_KEY_FILE`).

| Команда                            | Что делает                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `make deploy`                      | исходники на хост, сборка образов там же, миграции, запуск (`sync build migrate up`) |
| `make release TAG=<sha>`           | готовые образы из ghcr: compose-файлы, `pull`, миграции, запуск                      |
| `make env`                         | секреты приложения (`ENV_FILE`, по умолчанию `.env.production`) на хост              |
| `make sync` / `compose`            | исходники (rsync, кроме `.deployignore`) / только compose-файлы на хост              |
| `make build` / `pull`              | собрать образы на хосте / скачать из registry                                        |
| `make migrate`                     | применить миграции на хосте (одноразовый `migrate`)                                  |
| `make up` / `down`                 | запустить / остановить стек на хосте                                                 |
| `make status` / `logs` / `restart` | состояние сервисов / журнал `api` и `worker` / их перезапуск                         |
| `make db-dump` / `db-restore`      | дамп базы с хоста в файл / восстановление из файла (`DB_*`, `DB_DUMP_FILE`)          |
| `make image`                       | собрать образы `worker` и `api` на этой машине                                       |

**Makefile — production-стек на этой машине** (тот же состав, что на сервере)

| Команда           | Что делает                        |
| ----------------- | --------------------------------- |
| `make local-up`   | собрать и запустить стек в Docker |
| `make local-down` | остановить                        |
| `make local-logs` | журнал `api` и `worker`           |

### Process roles

Роль процесса задаёт `APP_ROLE`:

| Роль     | Что делает                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| `api`    | HTTP API и сокеты; задачи только ставит в очередь                                                                  |
| `worker` | выполняет задачи и cron; HTTP — только пробы и метрики; клиентских сокетов нет, события уходят через Redis-адаптер |
| `all`    | оба режима — для разработки (по умолчанию)                                                                         |

API масштабируется репликами за балансировщиком, воркеры — отдельными процессами.
Состояние между процессами — в Postgres и Redis.

### Workers

Фоновые задачи — очередь pg-boss в той же БД: повторы с backoff, отложенный запуск,
дедупликация, cron (ровно один процесс кластера), постановка в транзакции с данными.
Видимые задачи имеют прогресс, лог и отмену, их изменения приходят клиенту по сокету.

Очереди, объявленные `external`, выполняют **воркеры агентов**. Агент — программа на узле
([github.com/epifanovmd/agent](https://github.com/epifanovmd/agent)): соединение открывает
он сам (WebSocket), важные сообщения хранит на диске до подтверждения, работает без
связи, запускает воркеры — обычные HTTP-сервисы на unix-сокете на любом языке, без SDK.
Сторону сервера ведёт `agent-sdk` (модуль `agent`): хранилище агентов и настроек в
Postgres, регистрация по токенам, запросы к воркерам, настройки, метрики, события,
наблюдение, раздача сборок агента и обновление; задача очереди передаётся воркеру сразу после
постановки как задача его типа (`POST /jobs`): быстрая — итог в ответе, долгая — ход и
итог событиями. Несколько реплик API пересылают вызовы агентов друг другу
(`AGENT_RELAY_SECRET`). Образ агента с воркером проекта — `agent/docker/Dockerfile`. Как
агент и воркеры попадают на узлы — [agent/README.md](agent/README.md); как устроено и
как добавить свою очередь — [src/modules/agent/README.md](src/modules/agent/README.md);
формат сообщений — [sdk/spec/README.md](https://github.com/epifanovmd/agent/blob/main/sdk/spec/README.md).

### Build

```sh
yarn build     # генерация маршрутов + tsc: src/ → build/
yarn server    # запуск production-сборки (node build/main.js)
```

Сборка — только `tsc`, без копирования файлов: спецификация импортируется как JSON,
ассеты рантайма лежат в `templates/` и читаются по пути от корня проекта
(`core/paths`), одинаково в dev, сборке и Docker. Сборка сохраняет структуру модулей
и имена классов — это требование ORM и DI-контейнера; минификация с искажением имён
не применяется.

### Checks

Обязательный минимум перед merge:

```sh
yarn generate        # маршруты и OpenAPI генерируются без ошибок (коммитятся)
yarn lint            # eslint — 0 ошибок
yarn typecheck       # tsc --noEmit (watch: yarn dev:types)
yarn test            # юнит-тесты mocha (один файл: yarn test:file <path>)
yarn test:e2e        # интеграционный набор — при изменении API, схемы, инфраструктуры
```

Автофиксы:

```sh
yarn lint:fix
yarn prettier:fix
```

pre-commit (lefthook): prettier и eslint по staged-файлам, typecheck, юнит-тесты.

### E2E

```sh
docker compose -f docker-compose.dev.yml up -d
yarn agent:fetch     # скачать сборки агента с GitHub в agent/dist (один раз на версию agent-sdk)
yarn test:e2e
```

Набор `test/e2e/*.e2e.ts` поднимает настоящий сервер (`APP_ROLE=all`) против
Postgres, Redis, Mailpit и S3 и прогоняет сценарии всех эндпоинтов по HTTP и сокетам;
коды из писем берутся через API Mailpit. Перед прогоном стенд пересоздаёт базу
(только с `e2e`/`test` в имени) и очищает отдельную базу Redis (не `0`). Последний
тест проверяет, что вызван каждый эндпоинт спецификации. Параметры — переменные
`E2E_*` (по умолчанию — сервисы `docker-compose.dev.yml`), драйвер хранилища —
`E2E_STORAGE_DRIVER=s3|local`. В GitHub сервер стенда не ходит: агента и `netprobe` он
берёт с локального сервера сборок (файлы `agent/dist`), воркеры проекта стенд
собирает сам (`agent/release.sh`, нужен Go или Docker) и подписывает своим ключом.

### Codegen

Маршруты и OpenAPI-спецификация генерируются из декораторов контроллеров и
**не редактируются вручную**:

```sh
yarn generate
```

Генерация выполняется автоматически при `yarn dev` и `yarn build`.

Каркас нового модуля по конвенциям (сущность, репозиторий, сервис, контроллер, DTO,
схемы, ошибки, события, README, тесты):

```sh
yarn gen:module <name>            # kebab-case, единственное число
yarn gen:module <name> --dry-run  # только список файлов
```

Регистрацию модуля в `app.module.ts` и миграцию делает разработчик — скрипт
печатает шаги.

### Database migrations

```sh
yarn migration:generate src/migrations/<Name>   # миграция из изменений сущностей
yarn migration:run                              # применить
yarn migration:revert                           # откатить последнюю
```

Схема БД живёт только в миграциях: автосинхронизации нет ни в одном окружении.
Сущности регистрируются в `@Module({ entities })` — DataSource собирает их из дерева
модулей, без поиска файлов по маске. Новая миграция добавляется в
`src/migrations/index.ts`. Пока проект не запущен в работу, схема собрана в одну начальную
миграцию; каждое следующее изменение — новая миграция. CI проверяет, что миграции
применяются на чистую БД и что сущности не разошлись со схемой.
`DB_MIGRATIONS_RUN=false` — миграции отдельным шагом (`yarn migration:run:prod`),
сервер с отставшей схемой не стартует.

### Docker

Один `Dockerfile`, две цели: `api` (без ffmpeg) и `worker` (с ffmpeg, годится для
любой роли и миграций). Многостадийная сборка, только production-зависимости,
непривилегированный пользователь, `tini` как PID 1, read-only файловая система.

`docker-compose.yml` — production-стек: `api`, `worker`, одноразовый `migrate` и Redis.
Postgres и S3 (SeaweedFS) — отдельными файлами `docker-compose.postgres.yml` и
`docker-compose.s3.yml`; состав задаёт `COMPOSE_FILE`. Образы — из registry (`pull`)
или сборкой на хосте (`build`):

```sh
export COMPOSE_FILE=docker-compose.yml:docker-compose.postgres.yml:docker-compose.s3.yml
TAG=v1.2.3 docker compose pull                      # или: docker compose build api worker
docker compose run --rm migrate                     # одноразовый шаг миграций
docker compose up -d                                # api + worker + Postgres + Redis + S3
docker compose up -d --scale api=3                  # несколько реплик API
docker compose --profile agent up -d                # + агент с воркерами echo и netprobe
ENV_FILE=.env.staging docker compose up -d          # другой env-файл
```

`api` и `worker` ждут успешного `migrate`, Redis и (с S3-файлом) `s3-init` —
идемпотентное создание bucket. Внешний Postgres — без `docker-compose.postgres.yml`,
`POSTGRES_HOST` в `.env.production` (общий контейнер на этом же хосте —
`host.docker.internal`); без S3-файла — `STORAGE_DRIVER=local` (том `files`) или
внешний S3 через `S3_*`. `S3_PUBLIC_ENDPOINT` — адрес хранилища для клиентов, если API
ходит в S3 по внутреннему адресу. Остановка по SIGTERM: `/ready` → 503, пауза для
балансировщика, дожидание in-flight запросов и активных задач, затем сокеты и БД.

### CI / Release / Deploy

- **CI** (`ci.yml`): verify (generate + актуальность `src/routing`, lint, typecheck,
  test, build), migrations (чистая БД + дрейф схемы), e2e (матрица хранилища
  `s3`/`local`), audit production-зависимостей, docker (сборка обеих целей + Trivy);
  запускается на push и pull request в `main` (ветки-примеры CI не запускают);
  на push в `main` после всех проверок — deploy.
- **Release** (`release.yml`): по тегу `v*` на коммите из `main` — образы `api`, `worker` и `agent`
  (amd64/arm64) в GHCR; образ API собирает и раздаёт сборки воркеров проекта (`agent/release.sh`;
  подпись — секрет `AGENT_SIGNING_KEY` и переменная `AGENT_UPDATE_PUBLIC_KEY`), агента узлы
  получают из релизов GitHub.
- **Deploy** (`deploy.yml`, из CI или вручную с `main`): `make deploy` на хост по SSH — сборка
  там же. Настройки — переменная репозитория `DEPLOY_ENV` (содержимое `.env.deploy`),
  ключ — секрет `SSH_PRIVATE_KEY`; без `DEPLOY_ENV` CI деплой пропускает.
- **Makefile** (с машины разработчика, по SSH): `make release TAG=v1.2.3` —
  готовые образы из GHCR; `make deploy` — исходники на хост (rsync, исключения —
  `.deployignore`) и сборка там же, без registry. Хост, каталог, состав стека и база
  для дампов — в `.env.deploy` (образец — `.env.deploy.example`, файл не в git);
  любое значение переопределяется в команде (`make deploy SSH_HOST=…`). Секреты — `make env`;
  `status`, `logs`, `restart`, `down`; `db-dump` / `db-restore` — дамп базы с хоста в
  файл и обратно (`src/core/db/dump`, параметры `DB_CONTAINER`, `DB_USER`, `DB_NAME`).

### License

MIT

**Free Software, Good Work!**
