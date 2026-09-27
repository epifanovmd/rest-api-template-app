# Модуль Call

Модуль аудио- и видеозвонков с WebRTC-сигнализацией через WebSocket. Управляет жизненным циклом звонка (initiate -> answer/decline -> end), историей звонков и relay SDP/ICE-кандидатов.

## Структура файлов

```
src/modules/call/
├── call.module.ts             # Объявление модуля (@Module)
├── call.entity.ts             # Entity звонка (таблица calls)
├── call.repository.ts         # Репозиторий звонков
├── call.service.ts            # Сервис управления звонками
├── call.controller.ts         # REST-контроллер (tsoa)
├── call.types.ts              # Перечисления (ECallType, ECallStatus)
├── call.errors.ts             # CallError: доменные коды CALL_*
├── call.handler.ts            # Socket-обработчик (WebRTC signaling, onValidated)
├── call-ringing.job.ts        # задачи RINGING → MISSED: отложенная на звонок + cron-проход
├── call.listener.ts           # Слушатель событий EventBus -> Socket
├── dto/
│   ├── call.dto.ts            # CallDto, collectCallFiles
│   └── index.ts               # Реэкспорт DTO
├── events/
│   ├── call.event.ts          # CallInitiatedEvent, CallAnsweredEvent, CallDeclinedEvent, CallEndedEvent, CallMissedEvent
│   └── index.ts               # Реэкспорт событий
├── validation/
│   ├── call.validate.ts       # InitiateCallSchema
│   ├── call-socket.validate.ts # схемы сокет-событий сигналинга
│   └── index.ts               # Реэкспорт валидаций
├── call.service.test.ts       # Тесты сервиса
├── call.handler.test.ts       # Тесты сигналинга
├── call.listener.test.ts      # Тесты рассылки (подписанные аватары)
├── call-ringing.job.test.ts   # Тесты задач таймаута
└── index.ts                   # Публичный API модуля
```

## Entity

### Call (таблица `calls`)

| Поле                      | Тип                                    | Описание                                                  |
| ------------------------- | -------------------------------------- | --------------------------------------------------------- |
| `id`                      | `uuid` (PK)                            | Уникальный идентификатор                                  |
| `callerId`                | `uuid`                                 | ID инициатора                                             |
| `calleeId`                | `uuid`                                 | ID вызываемого                                            |
| `chatId`                  | `uuid`, nullable                       | Связанный чат                                             |
| `type`                    | `enum(ECallType)`, default `VOICE`     | Тип звонка                                                |
| `status`                  | `enum(ECallStatus)`, default `RINGING` | Статус звонка                                             |
| `ringingTimeoutAt`        | `timestamptz`, nullable                | Когда неотвеченный звонок станет MISSED (создание + 60 с) |
| `startedAt`               | `timestamp`, nullable                  | Время начала разговора                                    |
| `endedAt`                 | `timestamp`, nullable                  | Время завершения                                          |
| `duration`                | `int`, nullable                        | Длительность в секундах; только для отвеченных (ENDED)    |
| `createdAt` / `updatedAt` | `timestamp`                            | Временные метки                                           |

**Связи:**

- `ManyToOne` -> `User` (caller, `onDelete: CASCADE`)
- `ManyToOne` -> `User` (callee, `onDelete: CASCADE`)
- `ManyToOne` -> `Chat` (`onDelete: SET NULL`, nullable)

## Endpoints

Базовый путь: `/api/v1/call`. Коды ошибок — см. «Ошибки».

| Метод  | Путь                        | Security                                                 | Описание                                                                                                                                    |
| ------ | --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/call`              | `@Security("jwt")` + `@ValidateBody(InitiateCallSchema)` | Инициировать звонок (201). Тело: `calleeId`, `type?`. 404 — callee нет; 403 — блокировка; 409 — у кого-то из пары уже есть активный звонок. |
| `POST` | `/api/v1/call/{id}/answer`  | `@Security("jwt")`                                       | Ответить на звонок (callee). 400 — не RINGING или таймаут истёк; 409 — статус сменился параллельно.                                         |
| `POST` | `/api/v1/call/{id}/decline` | `@Security("jwt")`                                       | Отклонить звонок. Callee -> DECLINED, caller -> MISSED.                                                                                     |
| `POST` | `/api/v1/call/{id}/end`     | `@Security("jwt")`                                       | Завершить звонок. ACTIVE -> ENDED с duration; RINGING -> MISSED (caller) / DECLINED (callee).                                               |
| `GET`  | `/api/v1/call/history`      | `@Security("jwt")`                                       | История звонков: `IPaginatedDto<CallDto>` (`offset` 0, `limit` 20, максимум 100).                                                           |
| `GET`  | `/api/v1/call/active`       | `@Security("jwt")`                                       | Активный звонок текущего пользователя.                                                                                                      |

## Сервисы

### CallService

| Метод                                     | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initiateCall(callerId, data)`            | Проверки: не себе (400), callee существует (404), нет блокировки `UserBlockService.isBlockedEither` (403). `chatId` клиент не передаёт: звонок привязывается к direct-чату пары (`ChatRepository.findDirectChat`) или остаётся без чата — клиент не может приписать звонок чужому чату. В транзакции: `pg_advisory_xact_lock` на каждого из пары в отсортированном порядке (сериализует любые параллельные звонки с их участием, без дедлоков), затем проверка активных звонков (409) и создание с `ringingTimeoutAt`. |
| `answerCall(callId, userId)`              | Ответ на звонок. Только callee, статус RINGING, таймаут не истёк. Переход — условный UPDATE (`transitionStatus`).                                                                                                                                                                                                                                                                                                                                                                                                      |
| `declineCall(callId, userId)`             | Отклонение. Callee -> DECLINED, caller -> MISSED.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `endCall(callId, userId)`                 | ACTIVE -> ENDED с duration; RINGING — как `declineCall` (с уведомлением второй стороны).                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `expireRingingCalls()`                    | Все просроченные RINGING -> MISSED (`CallRepository.expireRinging`, UPDATE … RETURNING), по `CallMissedEvent` на каждый.                                                                                                                                                                                                                                                                                                                                                                                               |
| `expireRingingCall(callId)`               | Один звонок -> MISSED, если он ещё RINGING и срок вышел; иначе `false` без изменений.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `getCallHistory(userId, offset?, limit?)` | История (`IPaginatedDto<CallDto>`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `getActiveCall(userId)`                   | Текущий активный звонок.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Все переходы статуса атомарны (`UPDATE … WHERE status IN (…)`): гонки ответа, отмены
и таймаута не перезаписывают друг друга — проигравший получает 409.

## Задачи (очередь `JobQueue`)

| Очередь                | Обработчик                     | Когда                                                                                   | Что делает                         |
| ---------------------- | ------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------- |
| `call.ringing-timeout` | `CallRingingTimeoutJobHandler` | отложенная (`startAfter = ringingTimeoutAt`), одна на звонок (`singletonKey call:<id>`) | `expireRingingCall(callId)`        |
| `call.ringing-sweep`   | `CallRingingSweepJobHandler`   | `cron: * * * * *`                                                                       | `expireRingingCalls()` — страховка |

Почему так: только cron раз в минуту дал бы задержку MISSED до минуты при таймауте
60 с (звонок «звонит» до двух минут). Отложенная задача ставится в транзакции создания
звонка (`manager` — outbox: откат отменяет и задачу) и срабатывает точно в срок. Cron-проход
подбирает звонки, чья задача потерялась или сработала раньше срока из-за расхождения часов.
Оба перехода — условный `UPDATE … WHERE status = 'ringing' AND ringing_timeout_at <= now`:
ответ, отмена и таймаут не перезаписывают друг друга, повтор задачи безопасен. Ответ или
отклонение задачу не отменяют — она просто ничего не меняет. Выполняются на процессах
`APP_ROLE=worker|all`; `call:missed` доходит до клиентов через Redis-адаптер.

## DTO

- **CallDto** — id, callerId, calleeId, chatId, type, status, ringingTimeoutAt, startedAt, endedAt, duration, caller/callee (id, firstName, lastName, avatarUrl).
  `avatarUrl` — подписанная ссылка из карты: `FileUrlService.buildWithFiles(calls, collectCallFiles, CallDto.fromEntity)`; `CallDto.fromEntity(call, files)` — карта обязательна, аватара нет в карте — `null`;
  так и в ответах, и в событиях сокета.

## Ошибки (`call.errors.ts`, коды `CALL_*`)

`NOT_FOUND` 404, `SELF_CALL` 400, `USER_NOT_FOUND` 404, `USER_BLOCKED` 403,
`ALREADY_IN_CALL` 409 (у звонящего уже есть активный звонок), `BUSY` 409 (вызываемый
занят), `NOT_CALLEE` 403, `NOT_PARTICIPANT` 403, `NOT_RINGING` 400, `RINGING_EXPIRED` 400,
`ALREADY_ENDED` 400, `STATE_CHANGED` 409 (гонка переходов), `NOT_ACTIVE` 403 (сигналинг
вне RINGING/ACTIVE или не участником).

## События (Events)

| Событие              | Данные        | Когда                                |
| -------------------- | ------------- | ------------------------------------ |
| `CallInitiatedEvent` | `Call` entity | Звонок инициирован                   |
| `CallAnsweredEvent`  | `Call` entity | Звонок принят                        |
| `CallDeclinedEvent`  | `Call` entity | Звонок отклонён                      |
| `CallEndedEvent`     | `Call` entity | Звонок завершён                      |
| `CallMissedEvent`    | `Call` entity | Отмена caller'ом или таймаут RINGING |

## Socket-интеграция

### CallHandler (ISocketHandler) — WebRTC signaling

| Событие (входящее)   | Схема / лимит                                    | Описание                                                                                   |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `call:offer`         | `{ callId: uuid, sdp ≤ 64 КБ }`, 5/с (запас 10)  | Relay SDP offer второй стороне звонка.                                                     |
| `call:answer`        | `{ callId: uuid, sdp ≤ 64 КБ }`, 5/с (запас 10)  | Relay SDP answer.                                                                          |
| `call:ice-candidate` | `{ callId: uuid, candidate ≤ 4 КБ }`, 50/с (100) | Relay ICE candidate.                                                                       |
| `call:hangup`        | `{ callId: uuid }`, 5/с (запас 10)               | Сигнал завершения (`call:ended` второй стороне; статус не меняет — для этого `POST /end`). |

Регистрация — `onValidated` модуля socket (схема, лимит частоты на сокет, ack
`{ ok: false, error: { code, message } }` или событие `error` с `code`). Адресат — всегда
второй участник звонка из БД (`callerId`/`calleeId`); `targetUserId` клиента
игнорируется. Сигналинг разрешён только в статусах RINGING/ACTIVE, иначе —
`CALL_NOT_ACTIVE`.

### CallListener (ISocketEventListener)

| Событие EventBus     | Socket-событие  | Получатель      | Данные    |
| -------------------- | --------------- | --------------- | --------- |
| `CallInitiatedEvent` | `call:incoming` | callee          | `CallDto` |
| `CallAnsweredEvent`  | `call:answered` | caller          | `CallDto` |
| `CallDeclinedEvent`  | `call:declined` | caller + callee | `CallDto` |
| `CallEndedEvent`     | `call:ended`    | caller + callee | `CallDto` |
| `CallMissedEvent`    | `call:missed`   | caller + callee | `CallDto` |

## Перечисления

```typescript
enum ECallType {
  VOICE = "voice",
  VIDEO = "video",
}
enum ECallStatus {
  RINGING = "ringing",
  ACTIVE = "active",
  ENDED = "ended",
  MISSED = "missed",
  DECLINED = "declined",
}
```

## Зависимости

| Зависимость            | Откуда            | Использование                        |
| ---------------------- | ----------------- | ------------------------------------ |
| `User` entity          | `modules/user`    | Связь в entity                       |
| `Chat` entity          | `modules/chat`    | Связь в entity                       |
| `DataSource`           | `typeorm`         | Транзакция с `pg_advisory_xact_lock` |
| `UserRepository`       | `modules/user`    | Проверка существования callee        |
| `UserBlockService`     | `modules/contact` | Проверка блокировки                  |
| `ChatRepository`       | `modules/chat`    | Direct-чат пары                      |
| `EventBus`             | `core`            | Публикация и подписка на события     |
| `SocketEmitterService` | `modules/socket`  | Отправка socket-событий              |
| `CallRepository`       | self              | Проверка участия в handler           |
| `JobQueue`             | `core`            | Отложенный таймаут RINGING           |
| `FileUrlService`       | `modules/file`    | Подписанные ссылки аватаров          |
