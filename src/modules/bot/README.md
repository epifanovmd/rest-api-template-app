# Модуль Bot

Платформа для создания и управления ботами. Бот — отдельный участник чатов: у него
свой технический пользователь (`bot.userId`), от которого он состоит в чатах и пишет
сообщения. Бот добавляется в чат явно, работает через Bot API только в чатах, где он
участник, и получает события этих чатов через webhook. Доставка вебхуков идёт через
очередь задач `bot.webhook` с повторами.

## Структура файлов

```
src/modules/bot/
├── bot.module.ts                # Объявление модуля (@Module)
├── bot.entity.ts                # Entity бота (таблица bots)
├── bot-command.entity.ts        # Entity команды бота (таблица bot_commands)
├── webhook-log.entity.ts        # Entity журнала доставок (таблица webhook_logs)
├── bot.repository.ts            # Репозиторий ботов (+ счётчик провалов вебхука)
├── bot-command.repository.ts    # Репозиторий команд
├── webhook-log.repository.ts    # Репозиторий журнала доставок
├── bot.service.ts               # Сервис управления ботами и Bot API
├── webhook.service.ts           # Постановка, попытка доставки, SSRF, подпись, автоотключение
├── bot-webhook.job.ts           # Обработчик очереди bot.webhook
├── bot-webhook-logs-cleanup.job.ts # Cron bot.webhook-logs-cleanup: retention журнала доставок
├── bot.scheme.ts                # Схема аутентификации @Security("bot")
├── bot.controller.ts            # REST: управление ботами
├── bot-api.controller.ts        # REST: Bot API (сообщения)
├── bot.listener.ts              # Доменные события → очередь вебхуков; уведомление владельца
├── bot.errors.ts                # BotError (BOT_*), коды доставки BOT_WEBHOOK_*
├── bot.types.ts                 # Типы событий вебхука, очередь, лимиты доставки
├── index.ts                     # Публичный API модуля
├── dto/                         # BotDto, BotDetailDto, BotCommandDto, WebhookLogDto, тела запросов
├── events/                      # BotCreated/Updated/Deleted, BotWebhookDisabledEvent
├── validation/                  # Zod-схемы тел запросов
└── *.test.ts                    # Тесты сервиса, вебхуков, задачи, listener, схемы
```

## Entities

### Bot (таблица `bots`)

| Поле                      | Тип                       | Описание                                                              |
| ------------------------- | ------------------------- | --------------------------------------------------------------------- |
| `id`                      | `uuid` (PK)               | Уникальный идентификатор                                              |
| `ownerId`                 | `uuid`                    | ID владельца (управляет ботом, но не действует от его имени)          |
| `userId`                  | `uuid`, unique            | Технический пользователь бота: участник чатов и отправитель сообщений |
| `username`                | `varchar(50)`, unique     | Уникальное имя бота                                                   |
| `displayName`             | `varchar(100)`            | Отображаемое имя                                                      |
| `description`             | `text`, nullable          | Описание                                                              |
| `avatarId`                | `uuid`, nullable          | ID файла аватара                                                      |
| `token`                   | `varchar(256)`, unique    | API-токен бота (64 байта hex)                                         |
| `webhookUrl`              | `varchar(500)`, nullable  | URL для доставки событий                                              |
| `webhookSecret`           | `varchar(100)`, nullable  | HMAC-секрет подписи вебхука                                           |
| `webhookEvents`           | `jsonb`, default `[]`     | Фильтр типов событий; пустой — все                                    |
| `webhookFailureCount`     | `int`, default `0`        | Подряд проваленных доставок                                           |
| `webhookDisabledAt`       | `timestamptz`, nullable   | Вебхук отключён автоматически; `NULL` — работает                      |
| `isActive`                | `boolean`, default `true` | Активен ли бот                                                        |
| `createdAt` / `updatedAt` | `timestamptz`             | Временные метки                                                       |

**Индексы:** `IDX_BOTS_OWNER` — по ownerId; `IDX_BOTS_USER` — уникальный по userId.

**Технический пользователь** создаётся в одной транзакции с ботом: без email/телефона,
без ролей, с заведомо невалидным `passwordHash` (вход невозможен), профиль с
`firstName = displayName` (обрезается до 40). Смена `displayName` обновляет профиль.
Удаление бота удаляет и пользователя (членства в чатах — каскадом, сообщения
остаются с `senderId = NULL`).

**Связи:** `owner` → `User` (CASCADE), `user` → `User` (OneToOne, CASCADE),
`avatar` → `File` (SET NULL), `commands` → `BotCommand` (cascade).

`BotDto` / `BotDetailDto` — `fromEntity(bot, files)`: `avatarUrl` — подписанная ссылка
из карты (`collectBotFiles` + `FileUrlService`), `null` — аватара нет. Сборка с
подписью — `BotService.toDetailDto` и `getMyBots`.

### BotCommand (таблица `bot_commands`)

`id`, `botId`, `command varchar(50)`, `description varchar(200)`; уникальный
`IDX_BOT_COMMANDS_BOT_CMD` (botId, command).

### WebhookLog (таблица `webhook_logs`)

Запись на **каждую попытку** доставки (и на тестовый ping).

| Поле           | Тип               | Описание                                                      |
| -------------- | ----------------- | ------------------------------------------------------------- |
| `id`           | `uuid` (PK)       |                                                               |
| `botId`        | `uuid`            | Бот (CASCADE)                                                 |
| `deliveryId`   | `uuid`, nullable  | Доставка: общий id всех попыток одного события; ping — `NULL` |
| `eventType`    | `varchar(50)`     | Тип события                                                   |
| `payload`      | `jsonb`, nullable | Данные события                                                |
| `statusCode`   | `int`, nullable   | HTTP-статус ответа; `NULL` — ответа не было                   |
| `success`      | `boolean`         | 2xx                                                           |
| `errorMessage` | `text`, nullable  | Причина провала                                               |
| `attempts`     | `int`             | Номер попытки, с 1                                            |
| `durationMs`   | `int`, nullable   | Длительность запроса                                          |
| `createdAt`    | `timestamptz`     |                                                               |

Индексы: `IDX_WEBHOOK_LOGS_BOT_CREATED` (botId, createdAt) — журнал бота;
`IDX_WEBHOOK_LOGS_CREATED` (createdAt) — очистка. Записи старше 30 дней удаляет
`bot.webhook-logs-cleanup`.

**Индекс:** `IDX_WEBHOOK_LOGS_BOT_CREATED` (botId, createdAt).

## Endpoints

### Управление ботами (`/api/v1/bot`, `@Security("jwt")`, только владелец)

| Метод    | Путь                   | Описание                                                                                       |
| -------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| `POST`   | `/`                    | Создать бота с техническим пользователем (201). `CreateBotSchema`                              |
| `GET`    | `/`                    | Мои боты: `IPaginatedDto<BotDto>`, query `offset`, `limit` (≤ 100, по умолчанию 20)            |
| `GET`    | `/{id}`                | Детали бота                                                                                    |
| `PATCH`  | `/{id}`                | Обновить бота                                                                                  |
| `DELETE` | `/{id}`                | Удалить бота и его пользователя (204)                                                          |
| `POST`   | `/{id}/token`          | Перегенерировать API-токен                                                                     |
| `POST`   | `/{id}/webhook`        | Установить вебхук (`SetWebhookSchema`); включает автоматически отключённый, сбрасывает счётчик |
| `DELETE` | `/{id}/webhook`        | Удалить вебхук (204)                                                                           |
| `POST`   | `/{id}/webhook/events` | Фильтр событий вебхука (`SetWebhookEventsSchema`)                                              |
| `POST`   | `/{id}/webhook/test`   | Ping синхронно, без очереди и повторов; попытка пишется в журнал                               |
| `GET`    | `/{id}/webhook/logs`   | Журнал попыток: `IPaginatedDto<WebhookLogDto>`, `offset`, `limit`                              |
| `POST`   | `/{id}/commands`       | Заменить команды (`SetCommandsSchema`)                                                         |
| `GET`    | `/{id}/commands`       | Команды бота                                                                                   |
| `POST`   | `/{id}/chats/{chatId}` | Добавить бота в группу (204); права — владелец/админ чата, бот активен                         |
| `DELETE` | `/{id}/chats/{chatId}` | Удалить бота из чата (204), владелец/админ чата                                                |

### Bot API (`/api/v1/bot-api`, `@Security("bot")`)

| Метод    | Путь            | Описание                            |
| -------- | --------------- | ----------------------------------- |
| `POST`   | `/message`      | Отправить текстовое сообщение (201) |
| `PATCH`  | `/message/{id}` | Редактировать своё сообщение        |
| `DELETE` | `/message/{id}` | Удалить сообщение для всех (204)    |

Авторизация: `Authorization: Bot <token>` или `X-Bot-Token`; неверный или отключённый
бот → 401. Все действия — от `bot.userId` и только в чатах, где бот участник.

## Ошибки

| Код                     | Статус | Когда                                               |
| ----------------------- | ------ | --------------------------------------------------- |
| `BOT_NOT_FOUND`         | 404    | Бота нет                                            |
| `BOT_ACCESS_DENIED`     | 403    | Бот чужой                                           |
| `BOT_USERNAME_TAKEN`    | 409    | Username занят (в т.ч. гонка при вставке)           |
| `BOT_TOKEN_REQUIRED`    | 401    | `@Security("bot")`: токена нет                      |
| `BOT_INVALID_TOKEN`     | 401    | Неизвестный, слишком длинный токен или бот отключён |
| `BOT_INACTIVE`          | 400    | Бот отключён                                        |
| `BOT_NOT_CHAT_MEMBER`   | 403    | Бот не участник чата                                |
| `BOT_MESSAGE_NOT_FOUND` | 404    | Сообщение для Bot API не найдено                    |

Коды доставки (`JobError` задачи и журнал): `BOT_WEBHOOK_BLOCKED` (SSRF, некорректный
URL — без повторов), `BOT_WEBHOOK_DNS_FAILED`, `BOT_WEBHOOK_TIMEOUT`,
`BOT_WEBHOOK_NETWORK_ERROR`, `BOT_WEBHOOK_DELIVERY_FAILED`.

## Доставка вебхуков

1. `BotListener` на доменное событие находит ботов-участников чата
   (`findWebhookBotsByUserIds`: активные, с `webhookUrl`, не отключённые) и вызывает
   `WebhookService.enqueueEvent` — HTTP в процессе запроса не выполняется.
2. `enqueueEvent` проверяет фильтр событий и ставит задачу `bot.webhook`
   `{ botId, deliveryId, eventType, payload, timestamp }`. `deliveryId` — новый на каждое
   событие и бота; `singletonKey` не используется: события не ставятся повторно, а
   дедупликация по событию отбросила бы легитимные быстрые повторы (две правки подряд).
3. `BotWebhookJob` — одна попытка: бот перечитывается из БД (удалён, отключён, вебхук
   снят или отфильтрован → задача завершается), запрос, запись в `webhook_logs`.
   Очередь: 6 попыток (`retryLimit` 5), `retryDelaySeconds` 5, экспоненциальный backoff,
   `expireInSeconds` 60.
4. Успех сбрасывает `webhookFailureCount`. Провал последней попытки (или адрес
   заблокирован SSRF-защитой) увеличивает счётчик; на `WEBHOOK_FAILURE_THRESHOLD` (10)
   подряд проваленных доставок вебхук отключается (`webhookDisabledAt`), владелец
   получает `BotWebhookDisabledEvent` → сокет `bot:webhook-disabled`. Отключение —
   условный `UPDATE`, событие шлётся один раз даже при параллельных воркерах.
5. Включить снова — `POST /{id}/webhook` (или удалить и задать заново).

**Запрос:** `POST` JSON `{ event, bot_id, delivery_id, timestamp, payload }`, заголовки
`X-Bot-Signature` (HMAC-SHA256 тела секретом вебхука, пусто без секрета),
`X-Bot-Event`, `X-Bot-Delivery` (для идемпотентности получателя), `X-Bot-Attempt`.
Таймаут 10 с. **SSRF:** хост резолвится, любой приватный/loopback/link-local адрес
блокирует доставку, IP закрепляется в запросе (DNS rebinding), `Host` и SNI — исходные.

## События

| Событие                   | Данные                                  |
| ------------------------- | --------------------------------------- |
| `BotCreatedEvent`         | botId, ownerId                          |
| `BotUpdatedEvent`         | botId, ownerId                          |
| `BotDeletedEvent`         | botId, ownerId                          |
| `BotWebhookDisabledEvent` | botId, ownerId, failureCount, lastError |

## Очереди

| Очередь                    | Обработчик                 | Политика                                                                                                                             |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bot.webhook`              | `BotWebhookJob`            | 6 попыток, backoff от 5 с, срок 60 с, не tracked                                                                                     |
| `bot.webhook-logs-cleanup` | `BotWebhookLogsCleanupJob` | cron `45 3 * * *` (раз в сутки), 2 повтора: удаляет `webhook_logs` старше 30 дней (`BOT_WEBHOOK_LOG_RETENTION_DAYS`) пачками по 5000 |

## Socket

`bot:webhook-disabled` → владельцу: `{ botId, failureCount, lastError }`.

BotListener слушает события сообщений, участников, чатов, опросов и звонков. Бот не
получает события, автор которых — он сам. Новое сообщение — тип `message` или
`command` (если начинается с `/`).

## Конфиг

Отдельных переменных нет; лимиты — константы в `bot.types.ts`
(`WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_RETRY_DELAY_SECONDS`, `WEBHOOK_REQUEST_TIMEOUT_MS`,
`WEBHOOK_FAILURE_THRESHOLD`). Задачи выполняются на процессах `APP_ROLE=worker|all`.

## Зависимости

| Зависимость                           | Откуда                            | Использование                         |
| ------------------------------------- | --------------------------------- | ------------------------------------- |
| `User`, `Profile`, `File` entity      | `user`, `profile`, `file`         | Технический пользователь, аватар      |
| `MessageService`, `MessageRepository` | `message`                         | Bot API                               |
| `ChatService`, `ChatMemberRepository` | `chat`                            | Членство бота, участники для вебхуков |
| Доменные события                      | `message`, `chat`, `poll`, `call` | Триггеры вебхуков                     |
| `JobQueue`, `EventBus`                | `core`                            | Очередь доставки, события             |
| `SocketEmitterService`                | `socket`                          | `bot:webhook-disabled`                |
