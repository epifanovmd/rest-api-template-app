# Модуль Poll

Модуль опросов в чатах. Поддерживает создание опросов с вариантами ответов, голосование (одиночный и множественный выбор), анонимные опросы, отзыв голоса и закрытие опроса автором или администратором чата.

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
├── poll.errors.ts               # PollError: доменные коды POLL_*
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

| Поле                      | Тип                        | Описание                 |
| ------------------------- | -------------------------- | ------------------------ |
| `id`                      | `uuid` (PK)                | Уникальный идентификатор |
| `messageId`               | `uuid` (unique)            | Связанное сообщение      |
| `question`                | `varchar(300)`             | Текст вопроса            |
| `isAnonymous`             | `boolean`, default `false` | Анонимный опрос          |
| `isMultipleChoice`        | `boolean`, default `false` | Множественный выбор      |
| `isClosed`                | `boolean`, default `false` | Закрыт ли опрос          |
| `closedAt`                | `timestamp`, nullable      | Время закрытия           |
| `createdAt` / `updatedAt` | `timestamp`                | Временные метки          |

**Связи:**

- `OneToOne` -> `Message` (`onDelete: CASCADE`)
- `OneToMany` -> `PollOption` (cascade, eager)
- `OneToMany` -> `PollVote` (cascade)

### PollOption (таблица `poll_options`)

| Поле       | Тип            | Описание                 |
| ---------- | -------------- | ------------------------ |
| `id`       | `uuid` (PK)    | Уникальный идентификатор |
| `pollId`   | `uuid`         | ID опроса                |
| `text`     | `varchar(100)` | Текст варианта           |
| `position` | `int`          | Порядковый номер         |

### PollVote (таблица `poll_votes`)

| Поле        | Тип         | Описание                 |
| ----------- | ----------- | ------------------------ |
| `id`        | `uuid` (PK) | Уникальный идентификатор |
| `pollId`    | `uuid`      | ID опроса                |
| `optionId`  | `uuid`      | ID варианта              |
| `userId`    | `uuid`      | ID голосующего           |
| `createdAt` | `timestamp` | Время голоса             |

**Индексы:**

- `IDX_POLL_VOTES_UNIQUE` — уникальный составной (pollId, optionId, userId)

## Endpoints

Все `{id}`/`{chatId}` — UUID (иначе 422), все эндпоинты — `@Security("jwt")`.

| Метод    | Путь                         | Ответ         | Описание                                                                                                                                                                                               |
| -------- | ---------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/api/v1/chat/{chatId}/poll` | 201 `PollDto` | Создать опрос (`CreatePollSchema`). Идёт через `MessageService.sendMessage`: те же права, блокировки, slow mode (429 + `Retry-After`), lastMessage, непрочитанное и события, что у обычного сообщения. |
| `POST`   | `/api/v1/poll/{id}/vote`     | 200 `PollDto` | Проголосовать (`VotePollSchema`).                                                                                                                                                                      |
| `DELETE` | `/api/v1/poll/{id}/vote`     | 200 `PollDto` | Отозвать голос.                                                                                                                                                                                        |
| `POST`   | `/api/v1/poll/{id}/close`    | 200 `PollDto` | Закрыть опрос.                                                                                                                                                                                         |
| `GET`    | `/api/v1/poll/{id}`          | 200 `PollDto` | Получить опрос.                                                                                                                                                                                        |

## Правила

- Читать опрос, голосовать и отзывать голос может только участник чата (иначе 403 `CHAT_NOT_MEMBER`).
- Голос и отзыв по закрытому опросу — 400 `POLL_CLOSED`, по удалённому сообщению — 400 `POLL_MESSAGE_DELETED`.
- `optionIds` дедуплицируются; каждый — вариант этого опроса (`POLL_INVALID_OPTION`); в опросе с одиночным выбором — не больше одного (`POLL_SINGLE_CHOICE`).
- Закрыть опрос может автор или ADMIN/OWNER чата; оба должны быть текущими участниками (иначе 403 `POLL_CLOSE_FORBIDDEN`). Повторное закрытие — 400 `POLL_CLOSED`.
- Опроса нет — 404 `POLL_NOT_FOUND`. Ошибки создания — те же, что у отправки сообщения (`MESSAGE_*`, `CHAT_*`).
- Списков у модуля нет; опросы в ленте приходят внутри `MessageDto.poll`.
- Удаление сообщения с опросом «для всех» закрывает опрос (в `MessageService.deleteMessage`).

## Сервисы

### PollService

| Метод                                | Описание                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPoll(chatId, senderId, data)` | `sendMessage(..., { type: POLL, content: question }, { allowServiceTypes: true, onCreated })` — опрос и варианты пишутся в транзакции сообщения. Эмитит `PollCreatedEvent`. |
| `vote(pollId, userId, optionIds)`    | Удаляет старые голоса и создаёт новые в транзакции. Эмитит `PollVotedEvent`.                                                                                                |
| `retractVote(pollId, userId)`        | Отзыв голоса. Эмитит `PollVotedEvent`.                                                                                                                                      |
| `closePoll(pollId, userId)`          | Закрытие. Эмитит `PollClosedEvent`.                                                                                                                                         |
| `getPollById(pollId, userId)`        | Опрос с голосами пользователя.                                                                                                                                              |

## DTO

- **PollDto** — id, messageId, question, isAnonymous, isMultipleChoice, isClosed, closedAt, options, totalVotes, userVotedOptionIds
- **PollOptionDto** — id, text, position, voterCount, voterIds (пусто при анонимном опросе)

## События (Events)

| Событие            | Данные                                       | Когда               |
| ------------------ | -------------------------------------------- | ------------------- |
| `PollCreatedEvent` | `Poll`, `Message`, `chatId`, `memberUserIds` | Опрос создан        |
| `PollVotedEvent`   | `Poll`, `chatId`, `userId`                   | Голос отдан/отозван |
| `PollClosedEvent`  | `Poll`, `chatId`, `userId`                   | Опрос закрыт        |

## Socket-интеграция

`message:new` (с `poll` в `MessageDto`) и `chat:unread` с реальным счётчиком для нового опроса шлёт `MessageListener` по `MessageCreatedEvent` — отдельной рассылки при создании опроса нет.

### PollListener (ISocketEventListener)

| Событие EventBus  | Socket-событие | Адресат                  | Данные    |
| ----------------- | -------------- | ------------------------ | --------- |
| `PollVotedEvent`  | `poll:voted`   | каждый участник (toUser) | `PollDto` |
| `PollClosedEvent` | `poll:closed`  | каждый участник (toUser) | `PollDto` |

## Зависимости

| Зависимость            | Откуда            | Использование                 |
| ---------------------- | ----------------- | ----------------------------- |
| `Message` entity       | `modules/message` | Связь в Poll entity           |
| `MessageService`       | `modules/message` | Создание опроса как сообщения |
| `ChatService`          | `modules/chat`    | isMember, getMemberUserIds    |
| `ChatMemberRepository` | `modules/chat`    | Роль для закрытия опроса      |
| `DataSource`           | `typeorm`         | Транзакции голосования        |
| `EventBus`             | `core`            | Публикация событий            |
| `SocketEmitterService` | `modules/socket`  | Отправка socket-событий       |
