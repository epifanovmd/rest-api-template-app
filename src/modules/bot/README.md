# Модуль Bot

Модуль управления ботами. Позволяет пользователям создавать ботов, настраивать для них webhook-уведомления и команды, а также предоставляет Bot API для отправки/редактирования/удаления сообщений от имени бота.

## Структура файлов

```
src/modules/bot/
├── bot.entity.ts                  # Entity бота
├── bot-command.entity.ts          # Entity команды бота
├── bot.repository.ts              # Репозиторий Bot
├── bot-command.repository.ts      # Репозиторий BotCommand
├── bot.service.ts                 # Бизнес-логика управления ботами
├── webhook.service.ts             # Доставка webhook-событий
├── bot.controller.ts              # REST API управления ботами (jwt)
├── bot-api.controller.ts          # REST API действий от имени бота (bot token)
├── bot.listener.ts                # Слушатель событий (MessageCreatedEvent -> webhook)
├── bot.module.ts                  # Объявление модуля
├── dto/
│   └── bot.dto.ts                 # DTO: BotDto, BotDetailDto, BotCommandDto
├── validation/
│   ├── index.ts                   # Реэкспорт валидационных схем
│   ├── create-bot.validate.ts     # Zod-схема создания бота
│   ├── set-webhook.validate.ts    # Zod-схема установки webhook
│   ├── set-commands.validate.ts   # Zod-схема установки команд
│   └── bot.validation.test.ts     # Тесты валидации
├── bot.service.test.ts            # Тесты BotService
└── webhook.service.test.ts        # Тесты WebhookService
```

## Entity

### Bot (`bots`)

| Поле           | Тип              | Описание                            | Ограничения                      |
|----------------|------------------|-------------------------------------|----------------------------------|
| id             | uuid (PK)        | Уникальный идентификатор            | auto-generated                   |
| ownerId        | uuid (FK)        | ID владельца (User)                 | NOT NULL, index IDX_BOTS_OWNER   |
| username       | varchar(50)      | Уникальное имя бота                 | UNIQUE, NOT NULL                 |
| displayName    | varchar(100)     | Отображаемое имя                    | NOT NULL                         |
| description    | text             | Описание бота                       | nullable                         |
| avatarId       | uuid (FK)        | ID файла аватара (File)             | nullable                         |
| token          | varchar(256)     | API-токен бота                      | UNIQUE, NOT NULL                 |
| webhookUrl     | varchar(500)     | URL для webhook-уведомлений         | nullable                         |
| webhookSecret  | varchar(100)     | Секрет для HMAC-подписи webhook     | nullable                         |
| isActive       | boolean          | Активен ли бот                      | default: true                    |
| createdAt      | timestamp        | Дата создания                       | auto                             |
| updatedAt      | timestamp        | Дата обновления                     | auto                             |

**Связи:**
- `ManyToOne` -> `User` (owner) -- `onDelete: CASCADE`
- `ManyToOne` -> `File` (avatar) -- `onDelete: SET NULL`, nullable
- `OneToMany` -> `BotCommand[]` (commands) -- cascade: true

### BotCommand (`bot_commands`)

| Поле        | Тип           | Описание                  | Ограничения                                        |
|-------------|---------------|---------------------------|----------------------------------------------------|
| id          | uuid (PK)     | Уникальный идентификатор  | auto-generated                                     |
| botId       | uuid (FK)     | ID бота                   | NOT NULL                                           |
| command     | varchar(50)   | Название команды          | NOT NULL                                           |
| description | varchar(200)  | Описание команды          | NOT NULL                                           |

**Связи:**
- `ManyToOne` -> `Bot` (bot) -- `onDelete: CASCADE`

**Индексы:**
- `IDX_BOT_COMMANDS_BOT_CMD` -- уникальный составной индекс по `(botId, command)`

## Endpoints

### BotController -- `api/bot` (тег: Bot)

Управление ботами. Все эндпоинты требуют JWT-аутентификации. Доступ ограничен владельцем бота.

| Метод   | Путь                    | Описание                     | Security | Валидация         |
|---------|-------------------------|------------------------------|----------|-------------------|
| POST    | `/api/bot`              | Создать бота                 | jwt      | CreateBotSchema   |
| GET     | `/api/bot`              | Получить список моих ботов   | jwt      | --                |
| GET     | `/api/bot/{id}`         | Детали бота                  | jwt      | --                |
| PATCH   | `/api/bot/{id}`         | Обновить бота                | jwt      | --                |
| DELETE  | `/api/bot/{id}`         | Удалить бота                 | jwt      | --                |
| POST    | `/api/bot/{id}/token`   | Перегенерировать токен       | jwt      | --                |
| POST    | `/api/bot/{id}/webhook` | Установить webhook           | jwt      | SetWebhookSchema  |
| DELETE  | `/api/bot/{id}/webhook` | Удалить webhook              | jwt      | --                |
| POST    | `/api/bot/{id}/commands`| Установить команды бота      | jwt      | SetCommandsSchema |
| GET     | `/api/bot/{id}/commands`| Получить команды бота        | jwt      | --                |

**Тела запросов:**

- **POST `/api/bot`** -- `ICreateBotBody`:
  - `username` (string, обязательно) -- 3-50 символов, только `[a-zA-Z0-9_]`
  - `displayName` (string, обязательно) -- 1-100 символов
  - `description` (string, опционально) -- до 500 символов

- **PATCH `/api/bot/{id}`** -- `IUpdateBotBody`:
  - `displayName` (string, опционально)
  - `description` (string | null, опционально)
  - `avatarId` (string | null, опционально)

- **POST `/api/bot/{id}/webhook`** -- `ISetWebhookBody`:
  - `url` (string, обязательно) -- валидный URL, до 500 символов
  - `secret` (string, опционально) -- до 100 символов; если не указан, генерируется автоматически

- **POST `/api/bot/{id}/commands`** -- `ISetCommandsBody`:
  - `commands` (array, макс. 50 элементов):
    - `command` (string, 1-50 символов)
    - `description` (string, 1-200 символов)

### BotApiController -- `api/bot-api` (тег: Bot API)

API для действий от имени бота. Аутентификация по токену бота (заголовок `Authorization: Bot <token>` или `X-Bot-Token`).

| Метод   | Путь                           | Описание                     | Security |
|---------|--------------------------------|------------------------------|----------|
| POST    | `/api/bot-api/message/send`    | Отправить сообщение от бота  | bot      |
| POST    | `/api/bot-api/message/{id}/edit` | Редактировать сообщение    | bot      |
| DELETE  | `/api/bot-api/message/{id}`    | Удалить сообщение            | bot      |

**Тела запросов:**

- **POST `/api/bot-api/message/send`** -- `IBotSendMessageBody`:
  - `chatId` (string, обязательно)
  - `content` (string, опционально)
  - `type` (EMessageType, опционально)
  - `replyToId` (string, опционально)
  - `fileIds` (string[], опционально)

- **POST `/api/bot-api/message/{id}/edit`** -- `IBotEditMessageBody`:
  - `content` (string, обязательно)

## Сервисы

### BotService

Основная бизнес-логика управления ботами.

| Метод              | Описание                                                                 |
|--------------------|--------------------------------------------------------------------------|
| `createBot`        | Проверяет уникальность username, генерирует токен (64 байта hex), создает бота |
| `getMyBots`        | Возвращает список ботов владельца (сортировка по createdAt DESC)          |
| `getBotById`       | Получает бота с деталями; проверяет владельца (ForbiddenException)        |
| `updateBot`        | Обновляет displayName, description, avatarId                             |
| `deleteBot`        | Удаляет бота (проверяет владельца)                                       |
| `regenerateToken`  | Генерирует новый токен (64 байта hex)                                    |
| `setWebhook`       | Устанавливает webhookUrl и webhookSecret (автогенерация если не передан)  |
| `deleteWebhook`    | Обнуляет webhookUrl и webhookSecret                                      |
| `setCommands`      | Полностью заменяет список команд бота (delete + insert)                  |
| `getCommands`      | Возвращает команды бота (сортировка по command ASC)                       |
| `getBotByToken`    | Находит активного бота по токену (NotFoundException если не найден)       |

**Исключения:**
- `BadRequestException` -- username уже занят
- `NotFoundException` -- бот не найден
- `ForbiddenException` -- пользователь не является владельцем бота

### WebhookService

Доставка webhook-событий на внешний URL бота.

| Метод          | Описание                                                                       |
|----------------|--------------------------------------------------------------------------------|
| `deliverEvent` | Отправляет HTTP POST на webhookUrl бота с подписью HMAC-SHA256                 |

**Особенности:**
- Если `webhookUrl` не установлен -- ничего не делает
- HMAC-SHA256 подпись тела запроса с использованием `webhookSecret`
- Retry-механизм: до 3 попыток с задержками 1с, 5с, 25с
- Поддержка HTTP и HTTPS
- Таймаут запроса: 10 секунд
- Заголовки: `Content-Type`, `X-Bot-Signature`, `X-Bot-Event`

**Формат тела webhook:**
```json
{
  "event": "<eventType>",
  "bot_id": "<botId>",
  "timestamp": 1234567890,
  "payload": { ... }
}
```

## DTO

### BotDto

Краткая информация о боте (для списков).

| Поле        | Тип           | Описание            |
|-------------|---------------|---------------------|
| id          | string        | ID бота             |
| username    | string        | Username            |
| displayName | string        | Отображаемое имя    |
| description | string / null | Описание            |
| avatarUrl   | string / null | URL аватара (из File entity) |
| isActive    | boolean       | Активен ли бот      |
| createdAt   | Date          | Дата создания       |

### BotDetailDto (extends BotDto)

Полная информация о боте (для владельца).

| Поле       | Тип              | Описание                   |
|------------|------------------|----------------------------|
| token      | string           | API-токен бота             |
| webhookUrl | string / null    | URL webhook                |
| commands   | BotCommandDto[]  | Список команд              |

### BotCommandDto

| Поле        | Тип    | Описание          |
|-------------|--------|--------------------|
| command     | string | Название команды   |
| description | string | Описание команды   |

## События и Socket-интеграция

### BotListener (ISocketEventListener)

Слушатель доменных событий, зарегистрированный через `asSocketListener`.

**Подписки:**
- `MessageCreatedEvent` -- при создании нового сообщения в чате:
  1. Получает участников чата через `ChatMemberRepository`
  2. Находит всех активных ботов с установленным webhook
  3. Определяет тип события: `"command"` (если сообщение начинается с `/`) или `"message"`
  4. Для команд разбирает текст на `command` и `args`
  5. Вызывает `WebhookService.deliverEvent` для доставки

**Payload webhook-события:**
```json
{
  "messageId": "...",
  "chatId": "...",
  "senderId": "...",
  "content": "...",
  "type": "..."
}
```

Для команд дополнительно:
```json
{
  "command": "start",
  "args": "arg1 arg2"
}
```

## Зависимости

### Импортируемые модули и сервисы

- **User** (`user.entity`) -- связь `Bot.owner`
- **File** (`file.entity`) -- связь `Bot.avatar`, URL аватара в DTO
- **Message** (`message.service`, `message.dto`, `message.types`) -- BotApiController использует `MessageService` для отправки/редактирования/удаления сообщений; `BotListener` подписан на `MessageCreatedEvent`
- **Chat** (`chat-member.repository`) -- BotListener получает участников чата для определения контекста
- **Socket** (`asSocketListener`, `ISocketEventListener`) -- регистрация BotListener как слушателя событий
- **Core** (`EventBus`, `Injectable`, `InjectableRepository`, `Module`, `ValidateBody`, `getContextUser`, `logger`, `BaseRepository`, `BaseDto`)

### Провайдеры модуля

```typescript
@Module({
  providers: [
    BotRepository,
    BotCommandRepository,
    BotService,
    WebhookService,
    BotController,
    BotApiController,
    asSocketListener(BotListener),
  ],
})
export class BotModule {}
```

## Взаимодействие с другими модулями

1. **User** -- каждый бот принадлежит пользователю (`ownerId`). При удалении пользователя каскадно удаляются все его боты.

2. **File** -- бот может иметь аватар (ссылка на File entity). При удалении файла аватар бота обнуляется (`SET NULL`).

3. **Message** -- двустороннее взаимодействие:
   - BotApiController позволяет боту отправлять, редактировать и удалять сообщения через `MessageService` (действия выполняются от имени владельца бота -- `bot.ownerId`)
   - BotListener реагирует на `MessageCreatedEvent` и пересылает события через webhook

4. **Chat** -- BotListener использует `ChatMemberRepository` для получения участников чата при обработке входящих сообщений.

5. **Socket** -- BotListener зарегистрирован как `ISocketEventListener` через `asSocketListener()`, что позволяет ему подписываться на доменные события через `EventBus`.

## Тесты

Модуль покрыт тестами:
- `bot.service.test.ts` -- unit-тесты BotService (createBot, getMyBots, getBotById, updateBot, deleteBot, regenerateToken, setWebhook, deleteWebhook, setCommands, getCommands, getBotByToken)
- `webhook.service.test.ts` -- unit-тесты WebhookService (доставка, подпись HMAC, retry, таймаут, выбор HTTP/HTTPS)
- `validation/bot.validation.test.ts` -- тесты всех Zod-схем валидации (CreateBotSchema, SetWebhookSchema, SetCommandsSchema)
