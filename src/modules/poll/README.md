# Модуль Poll

Модуль опросов в чатах. Поддерживает создание опросов с вариантами ответов, голосование (одиночный и множественный выбор), анонимные опросы, отзыв голоса и закрытие опроса автором.

## Структура файлов

```
src/modules/poll/
├── poll.module.ts               # Объявление модуля (@Module)
├── poll.entity.ts               # Entity опроса (таблица polls)
├── poll-option.entity.ts        # Entity варианта ответа (таблица poll_options)
├── poll-vote.entity.ts          # Entity голоса (таблица poll_votes)
├── poll.repository.ts           # Репозиторий опросов
├── poll-option.repository.ts    # Репозиторий вариантов
├── poll-vote.repository.ts      # Репозиторий голосов
├── poll.service.ts              # Сервис управления опросами
├── poll.controller.ts           # REST-контроллер опросов
├── poll-chat.controller.ts      # REST-контроллер создания опроса в чате
├── poll.listener.ts             # Слушатель событий EventBus -> Socket
├── dto/
│   ├── poll.dto.ts              # PollDto, PollOptionDto
│   └── index.ts                 # Реэкспорт DTO
├── events/
│   ├── poll-created.event.ts    # PollCreatedEvent
│   ├── poll-voted.event.ts      # PollVotedEvent
│   ├── poll-closed.event.ts     # PollClosedEvent
│   └── index.ts                 # Реэкспорт событий
├── validation/
│   ├── create-poll.validate.ts  # CreatePollSchema, VotePollSchema
│   └── index.ts                 # Реэкспорт валидаций
├── poll.service.test.ts         # Тесты
└── index.ts                     # Публичный API модуля
```

## Entities

### Poll (таблица `polls`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `messageId` | `uuid` (unique) | Связанное сообщение |
| `question` | `varchar(300)` | Текст вопроса |
| `isAnonymous` | `boolean`, default `false` | Анонимный опрос |
| `isMultipleChoice` | `boolean`, default `false` | Множественный выбор |
| `isClosed` | `boolean`, default `false` | Закрыт ли опрос |
| `closedAt` | `timestamp`, nullable | Время закрытия |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Связи:**
- `OneToOne` -> `Message` (`onDelete: CASCADE`)
- `OneToMany` -> `PollOption` (cascade, eager)
- `OneToMany` -> `PollVote` (cascade)

### PollOption (таблица `poll_options`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `pollId` | `uuid` | ID опроса |
| `text` | `varchar(100)` | Текст варианта |
| `position` | `int` | Порядковый номер |

### PollVote (таблица `poll_votes`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `pollId` | `uuid` | ID опроса |
| `optionId` | `uuid` | ID варианта |
| `userId` | `uuid` | ID голосующего |
| `createdAt` | `timestamp` | Время голоса |

**Индексы:**
- `IDX_POLL_VOTES_UNIQUE` — уникальный составной (pollId, optionId, userId)

## Endpoints

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `POST` | `/api/chat/{chatId}/poll` | `@Security("jwt")` + `@ValidateBody(CreatePollSchema)` | Создать опрос в чате. Создает message типа POLL + poll + options в транзакции. |
| `POST` | `/api/poll/{id}/vote` | `@Security("jwt")` + `@ValidateBody(VotePollSchema)` | Проголосовать. Проверка членства в чате, валидность optionIds. |
| `DELETE` | `/api/poll/{id}/vote` | `@Security("jwt")` | Отозвать голос. |
| `POST` | `/api/poll/{id}/close` | `@Security("jwt")` | Закрыть опрос. Только автор. |
| `GET` | `/api/poll/{id}` | `@Security("jwt")` | Получить опрос по ID. |

## Сервисы

### PollService

| Метод | Описание |
|-------|----------|
| `createPoll(chatId, senderId, data)` | Создание опроса в транзакции. Проверяет `canSendMessage`. Эмитит `PollCreatedEvent`. |
| `vote(pollId, userId, optionIds)` | Голосование. Удаляет старые голоса + создает новые в транзакции. |
| `retractVote(pollId, userId)` | Отзыв голоса. |
| `closePoll(pollId, userId)` | Закрытие опроса. Только автор сообщения. |
| `getPollById(pollId, userId)` | Получить опрос с информацией о голосах пользователя. |

## DTO

- **PollDto** — id, messageId, question, isAnonymous, isMultipleChoice, isClosed, closedAt, options, totalVotes, userVotedOptionIds
- **PollOptionDto** — id, text, position, voterCount, voterIds (пусто при анонимном опросе)

## События (Events)

| Событие | Данные | Когда |
|---------|--------|-------|
| `PollCreatedEvent` | `Poll`, `Message`, `chatId`, `memberUserIds` | Опрос создан |
| `PollVotedEvent` | `Poll`, `chatId`, `userId` | Голос отдан/отозван |
| `PollClosedEvent` | `Poll`, `chatId`, `userId` | Опрос закрыт |

## Socket-интеграция

### PollListener (ISocketEventListener)

| Событие EventBus | Socket-событие | Комната | Данные |
|------------------|----------------|---------|--------|
| `PollCreatedEvent` | `message:new` | `chat_{chatId}` | `MessageDto` |
| `PollCreatedEvent` | `chat:unread` | участники (userId) | `{ chatId, unreadCount: -1 }` |
| `PollVotedEvent` | `poll:voted` | `chat_{chatId}` | `PollDto` |
| `PollClosedEvent` | `poll:closed` | `chat_{chatId}` | `PollDto` |

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `Message` entity | `modules/message` | Связь в Poll entity |
| `ChatService` | `modules/chat` | Проверка canSendMessage, isMember, getMemberUserIds |
| `MessageRepository` | `modules/message` | Транзакция при создании опроса |
| `DataSource` | `typeorm` | Транзакции голосования |
| `EventBus` | `core` | Публикация событий |
| `SocketEmitterService` | `modules/socket` | Отправка socket-событий |
