# Модуль Bot

Платформа для создания и управления ботами. Боты могут отправлять/редактировать/удалять сообщения через Bot API, получать входящие события через webhook, иметь пользовательские команды.

## Структура файлов

```
src/modules/bot/
├── bot.module.ts                # Объявление модуля (@Module)
├── bot.entity.ts                # Entity бота (таблица bots)
├── bot-command.entity.ts        # Entity команды бота (таблица bot_commands)
├── bot.repository.ts            # Репозиторий ботов
├── bot-command.repository.ts    # Репозиторий команд
├── bot.service.ts               # Сервис управления ботами
├── webhook.service.ts           # Сервис доставки webhook-событий
├── bot.controller.ts            # REST-контроллер управления ботами
├── bot-api.controller.ts        # REST-контроллер Bot API (отправка сообщений)
├── bot.listener.ts              # Слушатель событий — доставка webhook
├── dto/
│   └── bot.dto.ts               # BotDto, BotDetailDto, BotCommandDto
├── events/
│   ├── bot.events.ts            # BotCreatedEvent, BotUpdatedEvent, BotDeletedEvent
│   └── index.ts                 # Реэкспорт событий
├── validation/
│   ├── create-bot.validate.ts   # CreateBotSchema
│   ├── set-webhook.validate.ts  # SetWebhookSchema
│   ├── set-commands.validate.ts # SetCommandsSchema
│   ├── bot.validation.test.ts   # Тесты валидации
│   └── index.ts                 # Реэкспорт валидаций
├── bot.service.test.ts          # Тесты BotService
└── webhook.service.test.ts      # Тесты WebhookService
```

## Entities

### Bot (таблица `bots`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `ownerId` | `uuid` | ID владельца |
| `username` | `varchar(50)`, unique | Уникальное имя бота |
| `displayName` | `varchar(100)` | Отображаемое имя |
| `description` | `text`, nullable | Описание |
| `avatarId` | `uuid`, nullable | ID файла аватара |
| `token` | `varchar(256)`, unique | API-токен бота (64 байта hex) |
| `webhookUrl` | `varchar(500)`, nullable | URL для доставки событий |
| `webhookSecret` | `varchar(100)`, nullable | HMAC-секрет для подписи webhook |
| `isActive` | `boolean`, default `true` | Активен ли бот |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Индексы:** `IDX_BOTS_OWNER` — по ownerId

**Связи:**
- `ManyToOne` -> `User` (owner, `onDelete: CASCADE`)
- `ManyToOne` -> `File` (avatar, `onDelete: SET NULL`)
- `OneToMany` -> `BotCommand` (cascade)

### BotCommand (таблица `bot_commands`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `botId` | `uuid` | ID бота |
| `command` | `varchar(50)` | Текст команды |
| `description` | `varchar(200)` | Описание команды |

**Индексы:** `IDX_BOT_COMMANDS_BOT_CMD` — уникальный составной (botId, command)

## Endpoints

### Управление ботами (`/api/bot`)

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `POST` | `/api/bot` | `@Security("jwt")` + `@ValidateBody(CreateBotSchema)` | Создать бота |
| `GET` | `/api/bot` | `@Security("jwt")` | Мои боты |
| `GET` | `/api/bot/{id}` | `@Security("jwt")` | Детали бота (только владелец) |
| `PATCH` | `/api/bot/{id}` | `@Security("jwt")` | Обновить бота |
| `DELETE` | `/api/bot/{id}` | `@Security("jwt")` | Удалить бота |
| `POST` | `/api/bot/{id}/token` | `@Security("jwt")` | Перегенерировать API-токен |
| `POST` | `/api/bot/{id}/webhook` | `@Security("jwt")` + `@ValidateBody(SetWebhookSchema)` | Установить webhook |
| `DELETE` | `/api/bot/{id}/webhook` | `@Security("jwt")` | Удалить webhook |
| `POST` | `/api/bot/{id}/commands` | `@Security("jwt")` + `@ValidateBody(SetCommandsSchema)` | Установить команды бота |
| `GET` | `/api/bot/{id}/commands` | `@Security("jwt")` | Получить команды бота |

### Bot API (`/api/bot-api`)

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `POST` | `/api/bot-api/message/send` | `@Security("bot")` | Отправить сообщение от имени бота |
| `POST` | `/api/bot-api/message/{id}/edit` | `@Security("bot")` | Редактировать сообщение бота |
| `DELETE` | `/api/bot-api/message/{id}` | `@Security("bot")` | Удалить сообщение бота |

Авторизация Bot API: заголовок `Authorization: Bot <token>` или `X-Bot-Token`.

## Сервисы

### BotService

| Метод | Описание |
|-------|----------|
| `createBot(ownerId, data)` | Создать бота с уникальным username и случайным токеном |
| `getMyBots(ownerId)` | Боты текущего пользователя |
| `getBotById(botId, ownerId)` | Детали бота (проверка владельца) |
| `updateBot(botId, ownerId, data)` | Обновить бота |
| `deleteBot(botId, ownerId)` | Удалить бота |
| `regenerateToken(botId, ownerId)` | Перегенерировать API-токен |
| `setWebhook(botId, ownerId, url, secret?)` | Установить webhook URL и secret |
| `deleteWebhook(botId, ownerId)` | Удалить webhook |
| `setCommands(botId, ownerId, commands)` | Заменить команды бота (транзакция) |
| `getCommands(botId)` | Получить команды бота |
| `getBotByToken(token)` | Найти бота по API-токену |

### WebhookService

Доставка событий на webhook URL бота с HMAC-SHA256 подписью и retry (3 попытки с задержкой 1s/5s/25s).

## DTO

- **BotDto** — id, username, displayName, description, avatarUrl, isActive, createdAt
- **BotDetailDto** (extends BotDto) — token, webhookUrl, commands
- **BotCommandDto** — command, description

## События (Events)

| Событие | Данные |
|---------|--------|
| `BotCreatedEvent` | botId, ownerId |
| `BotUpdatedEvent` | botId, ownerId |
| `BotDeletedEvent` | botId, ownerId |

## Socket-интеграция

### BotListener (ISocketEventListener)

Слушает `MessageCreatedEvent`. Для каждого сообщения в чате находит ботов, чей owner является участником чата, и доставляет webhook-событие (тип `message` или `command` если начинается с `/`).

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `User` entity | `modules/user` | Связь owner |
| `File` entity | `modules/file` | Связь avatar |
| `MessageService` | `modules/message` | Bot API (отправка/редактирование/удаление) |
| `ChatMemberRepository` | `modules/chat` | BotListener — поиск участников чата |
| `MessageCreatedEvent` | `modules/message` | BotListener — триггер доставки webhook |
| `EventBus` | `core` | Публикация и подписка на события |
