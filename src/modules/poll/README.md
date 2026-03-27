# Модуль Poll (Опросы)

Модуль для создания и управления опросами в чатах. Поддерживает анонимные и множественные голосования, отзыв голоса, закрытие опроса автором, а также real-time уведомления через Socket.IO.

---

## Структура файлов

```
src/modules/poll/
├── poll.entity.ts              # Entity опроса
├── poll-option.entity.ts       # Entity варианта ответа
├── poll-vote.entity.ts         # Entity голоса
├── poll.repository.ts          # Репозиторий опросов
├── poll-option.repository.ts   # Репозиторий вариантов ответа
├── poll-vote.repository.ts     # Репозиторий голосов
├── poll.service.ts             # Бизнес-логика опросов
├── poll.service.test.ts        # Тесты сервиса
├── poll.controller.ts          # REST-контроллер (голосование, закрытие, получение)
├── poll-chat.controller.ts     # REST-контроллер (создание опроса в чате)
├── poll.listener.ts            # Socket-листенер доменных событий
├── poll.module.ts              # Модуль (IoC-регистрация)
├── dto/
│   ├── poll.dto.ts             # PollDto, PollOptionDto
│   └── index.ts
├── events/
│   ├── poll-voted.event.ts     # Событие голосования
│   ├── poll-closed.event.ts    # Событие закрытия опроса
│   └── index.ts
├── validation/
│   ├── create-poll.validate.ts # Zod-схемы валидации
│   └── index.ts
└── index.ts                    # Реэкспорт всех публичных сущностей
```

---

## Entities

### Poll (таблица `polls`)

| Поле              | Тип        | Описание                                      |
|-------------------|------------|-----------------------------------------------|
| `id`              | `uuid` PK  | Уникальный идентификатор опроса              |
| `messageId`       | `uuid` UQ  | Связь с сообщением (1:1)                     |
| `question`        | `varchar(300)` | Текст вопроса                            |
| `isAnonymous`     | `boolean`  | Анонимное голосование (по умолчанию `false`)  |
| `isMultipleChoice`| `boolean`  | Множественный выбор (по умолчанию `false`)    |
| `isClosed`        | `boolean`  | Опрос закрыт (по умолчанию `false`)           |
| `closedAt`        | `timestamp`| Дата закрытия (nullable)                      |
| `createdAt`       | `timestamp`| Дата создания (auto)                          |
| `updatedAt`       | `timestamp`| Дата обновления (auto)                        |

**Связи:**
- `OneToOne` -> `Message` (по `messageId`, `onDelete: CASCADE`)
- `OneToMany` -> `PollOption[]` (cascade: true, eager: true)
- `OneToMany` -> `PollVote[]` (cascade: true)

### PollOption (таблица `poll_options`)

| Поле       | Тип          | Описание                         |
|------------|--------------|----------------------------------|
| `id`       | `uuid` PK    | Уникальный идентификатор         |
| `pollId`   | `uuid`       | Связь с опросом                  |
| `text`     | `varchar(100)`| Текст варианта ответа           |
| `position` | `int`        | Порядковый номер (0-based)       |

**Связи:**
- `ManyToOne` -> `Poll` (по `pollId`, `onDelete: CASCADE`)
- `OneToMany` -> `PollVote[]`

### PollVote (таблица `poll_votes`)

| Поле       | Тип       | Описание                     |
|------------|-----------|------------------------------|
| `id`       | `uuid` PK | Уникальный идентификатор    |
| `pollId`   | `uuid`    | Связь с опросом              |
| `optionId` | `uuid`    | Связь с вариантом ответа     |
| `userId`   | `uuid`    | Связь с пользователем        |
| `createdAt`| `timestamp`| Дата голосования (auto)     |

**Уникальный индекс:** `IDX_POLL_VOTES_UNIQUE` по (`pollId`, `optionId`, `userId`) -- один пользователь не может проголосовать за один вариант дважды.

**Связи:**
- `ManyToOne` -> `Poll` (`onDelete: CASCADE`)
- `ManyToOne` -> `PollOption` (`onDelete: CASCADE`)
- `ManyToOne` -> `User` (`onDelete: CASCADE`)

---

## Endpoints

### PollController (`api/poll`)

| Метод    | Путь                   | Описание            | Security | Тело запроса                     |
|----------|------------------------|----------------------|----------|----------------------------------|
| `POST`   | `api/poll/{id}/vote`   | Голосование в опросе | `jwt`    | `{ optionIds: string[] }`        |
| `DELETE`  | `api/poll/{id}/vote`   | Отзыв голоса        | `jwt`    | --                               |
| `POST`   | `api/poll/{id}/close`  | Закрытие опроса      | `jwt`    | --                               |
| `GET`    | `api/poll/{id}`        | Получение опроса     | `jwt`    | --                               |

### PollChatController (`api/chat`)

| Метод  | Путь                       | Описание              | Security | Тело запроса                                                                  |
|--------|----------------------------|-----------------------|----------|-------------------------------------------------------------------------------|
| `POST` | `api/chat/{chatId}/poll`   | Создание опроса в чате | `jwt`    | `{ question: string, options: string[], isAnonymous?: boolean, isMultipleChoice?: boolean }` |

Все endpoints требуют JWT-аутентификацию. Дополнительных permission не требуется.

---

## Сервис (PollService)

### Методы

#### `createPoll(chatId, senderId, data)`
- Проверяет право пользователя отправлять сообщения в чат через `ChatService.canSendMessage()`
- Создает в одной транзакции: сообщение (тип `POLL`), опрос и варианты ответа
- Обновляет `lastMessageAt` в чате
- Возвращает `PollDto`

#### `vote(pollId, userId, optionIds)`
- Проверяет: опрос существует, не закрыт, варианты валидны
- Для single-choice опроса запрещает выбор нескольких вариантов
- Удаляет предыдущие голоса пользователя (переголосование)
- Создает новые записи голосов
- Эмитит `PollVotedEvent`

#### `retractVote(pollId, userId)`
- Проверяет: опрос существует и не закрыт
- Удаляет все голоса пользователя в данном опросе
- Эмитит `PollVotedEvent`

#### `closePoll(pollId, userId)`
- Проверяет: опрос существует, не закрыт, пользователь является автором сообщения
- Устанавливает `isClosed = true` и `closedAt`
- Эмитит `PollClosedEvent`

#### `getPollById(pollId, userId)`
- Возвращает `PollDto` с данными об опросе, включая `userVotedOptionIds` для текущего пользователя

### Бизнес-правила
- Голосовать в закрытом опросе нельзя
- Отозвать голос в закрытом опросе нельзя
- Закрыть опрос может только автор (отправитель исходного сообщения)
- При повторном голосовании предыдущие голоса удаляются
- В single-choice опросе можно выбрать только один вариант

---

## DTO

### PollDto

| Поле                 | Тип               | Описание                                       |
|----------------------|-------------------|-------------------------------------------------|
| `id`                 | `string`          | ID опроса                                       |
| `messageId`          | `string`          | ID связанного сообщения                         |
| `question`           | `string`          | Текст вопроса                                   |
| `isAnonymous`        | `boolean`         | Анонимный ли опрос                              |
| `isMultipleChoice`   | `boolean`         | Множественный выбор                             |
| `isClosed`           | `boolean`         | Опрос закрыт                                    |
| `closedAt`           | `Date \| null`    | Дата закрытия                                   |
| `options`            | `PollOptionDto[]` | Варианты ответа (отсортированы по `position`)   |
| `totalVotes`         | `number`          | Общее количество голосов                        |
| `userVotedOptionIds` | `string[]`        | ID вариантов, за которые проголосовал текущий пользователь |
| `createdAt`          | `Date`            | Дата создания                                   |
| `updatedAt`          | `Date`            | Дата обновления                                 |

### PollOptionDto

| Поле         | Тип        | Описание                                                |
|--------------|------------|---------------------------------------------------------|
| `id`         | `string`   | ID варианта                                              |
| `text`       | `string`   | Текст варианта                                           |
| `position`   | `number`   | Порядковый номер                                         |
| `voterCount` | `number`   | Количество голосов за этот вариант                        |
| `voterIds`   | `string[]` | ID проголосовавших (пустой массив для анонимных опросов) |

---

## Валидация (Zod-схемы)

### CreatePollSchema

| Поле              | Правила                                              |
|-------------------|------------------------------------------------------|
| `question`        | `string`, min 1, max 300 символов                    |
| `options`         | `string[]`, min 2, max 10 элементов; каждый min 1, max 100 символов |
| `isAnonymous`     | `boolean`, optional, default `false`                 |
| `isMultipleChoice`| `boolean`, optional, default `false`                 |

### VotePollSchema

| Поле        | Правила                                       |
|-------------|-----------------------------------------------|
| `optionIds` | `string[]` uuid, min 1 элемент                |

---

## События (Events)

### PollVotedEvent
Эмитится при голосовании или отзыве голоса.

| Свойство | Тип    | Описание                 |
|----------|--------|--------------------------|
| `poll`   | `Poll` | Обновленная entity опроса |
| `chatId` | `string` | ID чата                |
| `userId` | `string` | ID пользователя        |

### PollClosedEvent
Эмитится при закрытии опроса.

| Свойство | Тип    | Описание                 |
|----------|--------|--------------------------|
| `poll`   | `Poll` | Обновленная entity опроса |
| `chatId` | `string` | ID чата                |
| `userId` | `string` | ID пользователя        |

---

## Socket-интеграция

### PollListener

Слушает доменные события через `EventBus` и транслирует их в Socket.IO комнаты.

| Событие EventBus    | Socket-событие  | Комната          | Данные     |
|----------------------|-----------------|------------------|------------|
| `PollVotedEvent`     | `poll:voted`    | `chat_{chatId}`  | `PollDto`  |
| `PollClosedEvent`    | `poll:closed`   | `chat_{chatId}`  | `PollDto`  |

Зарегистрирован через `asSocketListener(PollListener)` в модуле.

---

## Зависимости

### Внешние модули (импорт через inject)

| Зависимость          | Модуль    | Использование                                           |
|----------------------|-----------|---------------------------------------------------------|
| `ChatService`        | Chat      | Проверка права отправки сообщений (`canSendMessage`)    |
| `MessageRepository`  | Message   | Создание сообщения типа `POLL` (через транзакцию)       |
| `SocketEmitterService`| Socket   | Отправка real-time уведомлений в Socket.IO комнаты      |
| `EventBus`           | Core      | Публикация и подписка на доменные события                |

### Связанные entities из других модулей

| Entity    | Модуль  | Тип связи                                   |
|-----------|---------|----------------------------------------------|
| `Message` | Message | `OneToOne` -- опрос привязан к сообщению     |
| `User`    | User    | `ManyToOne` -- голос привязан к пользователю |

---

## Взаимодействие с другими модулями

1. **Chat** -- перед созданием опроса вызывается `ChatService.canSendMessage()` для проверки прав. При создании опроса обновляется `lastMessageAt` в чате.

2. **Message** -- опрос всегда создается как сообщение типа `EMessageType.POLL`. Entity `Poll` связана 1:1 с `Message`. При удалении сообщения каскадно удаляется опрос.

3. **User** -- голоса (`PollVote`) привязаны к пользователю. При удалении пользователя каскадно удаляются его голоса.

4. **Socket** -- через `PollListener` и `SocketEmitterService` модуль отправляет real-time обновления (`poll:voted`, `poll:closed`) всем участникам чата, подключенным к комнате `chat_{chatId}`.
