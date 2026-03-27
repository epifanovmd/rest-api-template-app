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
├── call.handler.ts            # Socket-обработчик (WebRTC signaling)
├── call.listener.ts           # Слушатель событий EventBus -> Socket
├── dto/
│   ├── call.dto.ts            # CallDto, ICallHistoryDto
│   └── index.ts               # Реэкспорт DTO
├── events/
│   ├── call.event.ts          # CallInitiatedEvent, CallAnsweredEvent, CallDeclinedEvent, CallEndedEvent, CallMissedEvent
│   └── index.ts               # Реэкспорт событий
├── validation/
│   ├── call.validate.ts       # InitiateCallSchema
│   └── index.ts               # Реэкспорт валидаций
├── call.service.test.ts       # Тесты
└── index.ts                   # Публичный API модуля
```

## Entity

### Call (таблица `calls`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `callerId` | `uuid` | ID инициатора |
| `calleeId` | `uuid` | ID вызываемого |
| `chatId` | `uuid`, nullable | Связанный чат |
| `type` | `enum(ECallType)`, default `VOICE` | Тип звонка |
| `status` | `enum(ECallStatus)`, default `RINGING` | Статус звонка |
| `startedAt` | `timestamp`, nullable | Время начала разговора |
| `endedAt` | `timestamp`, nullable | Время завершения |
| `duration` | `int`, nullable | Длительность в секундах |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Связи:**
- `ManyToOne` -> `User` (caller, `onDelete: CASCADE`)
- `ManyToOne` -> `User` (callee, `onDelete: CASCADE`)
- `ManyToOne` -> `Chat` (`onDelete: SET NULL`, nullable)

## Endpoints

Базовый путь: `/api/call`

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `POST` | `/api/call` | `@Security("jwt")` + `@ValidateBody(InitiateCallSchema)` | Инициировать звонок. Транзакция с pessimistic lock. |
| `POST` | `/api/call/{id}/answer` | `@Security("jwt")` | Ответить на звонок (callee). |
| `POST` | `/api/call/{id}/decline` | `@Security("jwt")` | Отклонить звонок. Callee -> DECLINED, caller -> MISSED. |
| `POST` | `/api/call/{id}/end` | `@Security("jwt")` | Завершить звонок. Вычисляет duration. |
| `GET` | `/api/call/history` | `@Security("jwt")` | История звонков с пагинацией (`limit`, `offset`). |
| `GET` | `/api/call/active` | `@Security("jwt")` | Активный звонок текущего пользователя. |

## Сервисы

### CallService

| Метод | Описание |
|-------|----------|
| `initiateCall(callerId, data)` | Создание звонка в транзакции с pessimistic_write lock. Проверяет отсутствие активных звонков у обоих участников. |
| `answerCall(callId, userId)` | Ответ на звонок. Только callee, статус RINGING. |
| `declineCall(callId, userId)` | Отклонение. Callee -> DECLINED, caller -> MISSED. |
| `endCall(callId, userId)` | Завершение. Вычисляет duration. |
| `getCallHistory(userId, limit?, offset?)` | История с пагинацией. |
| `getActiveCall(userId)` | Текущий активный звонок. |

## DTO

- **CallDto** — id, callerId, calleeId, chatId, type, status, startedAt, endedAt, duration, caller/callee (id, firstName, lastName, avatarUrl)
- **ICallHistoryDto** — `{ data: CallDto[], totalCount: number }`

## События (Events)

| Событие | Данные | Когда |
|---------|--------|-------|
| `CallInitiatedEvent` | `Call` entity | Звонок инициирован |
| `CallAnsweredEvent` | `Call` entity | Звонок принят |
| `CallDeclinedEvent` | `Call` entity | Звонок отклонён |
| `CallEndedEvent` | `Call` entity | Звонок завершён |
| `CallMissedEvent` | `Call` entity | Пропущенный звонок |

## Socket-интеграция

### CallHandler (ISocketHandler) — WebRTC signaling

| Событие (входящее) | Описание |
|--------------------|----------|
| `call:offer` | Relay SDP offer целевому пользователю. Проверка участия в звонке. |
| `call:answer` | Relay SDP answer. |
| `call:ice-candidate` | Relay ICE candidate. |
| `call:hangup` | Сигнал завершения. |

### CallListener (ISocketEventListener)

| Событие EventBus | Socket-событие | Получатель | Данные |
|------------------|----------------|------------|--------|
| `CallInitiatedEvent` | `call:incoming` | callee | `CallDto` |
| `CallAnsweredEvent` | `call:answered` | caller | `CallDto` |
| `CallDeclinedEvent` | `call:declined` | caller | `CallDto` |
| `CallEndedEvent` | `call:ended` | caller + callee | `CallDto` |
| `CallMissedEvent` | `call:missed` | callee | `CallDto` |

## Перечисления

```typescript
enum ECallType { VOICE = "voice", VIDEO = "video" }
enum ECallStatus { RINGING = "ringing", ACTIVE = "active", ENDED = "ended", MISSED = "missed", DECLINED = "declined" }
```

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `User` entity | `modules/user` | Связь в entity |
| `Chat` entity | `modules/chat` | Связь в entity |
| `DataSource` | `typeorm` | Транзакции с pessimistic lock |
| `EventBus` | `core` | Публикация и подписка на события |
| `SocketEmitterService` | `modules/socket` | Отправка socket-событий |
| `CallRepository` | self | Проверка участия в handler |
