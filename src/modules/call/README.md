# Модуль Call (Звонки)

Модуль управления голосовыми и видеозвонками между пользователями. Поддерживает полный жизненный цикл звонка: инициация, ответ, отклонение, завершение. Включает WebRTC-сигнализацию через Socket.IO и доменные события для реактивного уведомления участников.

---

## Структура файлов

```
src/modules/call/
├── call.entity.ts            # TypeORM-сущность звонка
├── call.types.ts             # Перечисления ECallType и ECallStatus
├── call.repository.ts        # Репозиторий с кастомными запросами
├── call.service.ts           # Бизнес-логика звонков
├── call.controller.ts        # REST-контроллер (tsoa)
├── call.handler.ts           # Socket-обработчик WebRTC-сигнализации
├── call.listener.ts          # Слушатель доменных событий -> Socket-уведомления
├── call.module.ts            # Объявление модуля
├── call.service.test.ts      # Unit-тесты сервиса
├── index.ts                  # Публичный реэкспорт
├── dto/
│   ├── call.dto.ts           # DTO звонка и интерфейс истории
│   └── index.ts
├── events/
│   ├── call.event.ts         # Доменные события (5 классов)
│   └── index.ts
└── validation/
    ├── call.validate.ts      # Zod-схема валидации инициации звонка
    └── index.ts
```

---

## Entity: `Call`

Таблица: `calls`

### Поля

| Поле         | Тип БД            | TypeScript-тип       | Описание                                |
|--------------|--------------------|-----------------------|-----------------------------------------|
| `id`         | `uuid` (PK)       | `string`              | Уникальный идентификатор звонка         |
| `callerId`   | `uuid`             | `string`              | ID инициатора звонка                    |
| `calleeId`   | `uuid`             | `string`              | ID вызываемого пользователя             |
| `chatId`     | `uuid`, nullable   | `string \| null`      | ID чата, из которого инициирован звонок |
| `type`       | `enum(ECallType)`  | `ECallType`           | Тип звонка: `voice` или `video`         |
| `status`     | `enum(ECallStatus)`| `ECallStatus`         | Статус звонка (см. ниже)                |
| `startedAt`  | `timestamp`, nullable | `Date \| null`     | Время начала разговора (после ответа)   |
| `endedAt`    | `timestamp`, nullable | `Date \| null`     | Время завершения звонка                 |
| `duration`   | `int`, nullable    | `number \| null`      | Длительность в секундах                 |
| `createdAt`  | `timestamp`        | `Date`                | Дата создания записи                    |
| `updatedAt`  | `timestamp`        | `Date`                | Дата последнего обновления              |

### Перечисления

**`ECallType`**:
- `VOICE` = `"voice"` -- голосовой звонок
- `VIDEO` = `"video"` -- видеозвонок

**`ECallStatus`**:
- `RINGING` = `"ringing"` -- вызов, ожидание ответа
- `ACTIVE` = `"active"` -- разговор идёт
- `ENDED` = `"ended"` -- звонок завершён
- `MISSED` = `"missed"` -- звонок пропущен (инициатор отменил)
- `DECLINED` = `"declined"` -- звонок отклонён вызываемым

### Связи с другими Entity

| Связь     | Тип        | Целевая Entity | FK-колонка   | Поведение при удалении |
|-----------|------------|----------------|--------------|------------------------|
| `caller`  | `ManyToOne`| `User`         | `caller_id`  | `CASCADE`              |
| `callee`  | `ManyToOne`| `User`         | `callee_id`  | `CASCADE`              |
| `chat`    | `ManyToOne`| `Chat`         | `chat_id`    | `SET NULL`             |

---

## Endpoints (REST API)

Базовый путь: `/api/call`
Тег Swagger: `Call`

| Метод  | Путь                  | Описание                           | Security    | Тело запроса             | Ответ                |
|--------|-----------------------|------------------------------------|-------------|--------------------------|----------------------|
| `POST` | `/api/call`           | Инициировать звонок                | `jwt`       | `IInitiateCallBody`      | `CallDto`            |
| `POST` | `/api/call/{id}/answer`  | Ответить на входящий звонок     | `jwt`       | --                       | `CallDto`            |
| `POST` | `/api/call/{id}/decline` | Отклонить звонок                | `jwt`       | --                       | `CallDto`            |
| `POST` | `/api/call/{id}/end`     | Завершить активный звонок       | `jwt`       | --                       | `CallDto`            |
| `GET`  | `/api/call/history`   | Получить историю звонков           | `jwt`       | Query: `limit?`, `offset?` | `ICallHistoryDto`  |
| `GET`  | `/api/call/active`    | Получить текущий активный звонок   | `jwt`       | --                       | `CallDto \| null`    |

Все эндпоинты требуют JWT-аутентификации (`@Security("jwt")`), без дополнительных permission-требований.

### Тело запроса инициации звонка (`IInitiateCallBody`)

```typescript
{
  calleeId: string;    // UUID вызываемого пользователя (обязательное)
  chatId?: string;     // UUID чата (необязательное)
  type?: ECallType;    // "voice" | "video", по умолчанию "voice"
}
```

Валидация выполняется Zod-схемой `InitiateCallSchema`.

---

## Сервис: `CallService`

Инжектирует: `CallRepository`, `EventBus`.

### Методы

#### `initiateCall(callerId, data)`
- Проверяет, что пользователь не звонит сам себе
- Проверяет, что у caller нет активных звонков
- Проверяет, что у callee нет активных звонков
- Создаёт запись со статусом `RINGING`
- Эмитит `CallInitiatedEvent`
- Возвращает `CallDto`

#### `answerCall(callId, userId)`
- Только callee может ответить
- Звонок должен быть в статусе `RINGING`
- Устанавливает статус `ACTIVE`, записывает `startedAt`
- Эмитит `CallAnsweredEvent`

#### `declineCall(callId, userId)`
- Могут вызвать оба участника
- Звонок должен быть в статусе `RINGING`
- Если отклоняет callee -- статус `DECLINED`, если caller отменяет -- статус `MISSED`
- Записывает `endedAt`
- Эмитит `CallDeclinedEvent` или `CallMissedEvent` соответственно

#### `endCall(callId, userId)`
- Могут вызвать оба участника
- Звонок должен быть `ACTIVE` или `RINGING`
- Устанавливает статус `ENDED`, записывает `endedAt`
- Если был `startedAt`, вычисляет `duration` в секундах
- Эмитит `CallEndedEvent`

#### `getCallHistory(userId, limit?, offset?)`
- Возвращает пагинированный список звонков пользователя (как caller или callee)
- По умолчанию: `limit=50`, `offset=0`
- Возвращает `{ data: CallDto[], totalCount: number }`

#### `getActiveCall(userId)`
- Возвращает первый активный звонок пользователя или `null`

---

## DTO

### `CallDto`

Наследуется от `BaseDto`. Содержит все поля entity, а также вложенные объекты участников:

```typescript
{
  id: string;
  callerId: string;
  calleeId: string;
  chatId: string | null;
  type: ECallType;
  status: ECallStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
  caller?: { id: string; firstName?: string; lastName?: string; avatarUrl?: string; };
  callee?: { id: string; firstName?: string; lastName?: string; avatarUrl?: string; };
}
```

Данные `caller` и `callee` заполняются из связанных User-сущностей и их профилей (profile.firstName, profile.lastName, profile.avatar.url).

### `ICallHistoryDto`

```typescript
{
  data: CallDto[];
  totalCount: number;
}
```

---

## События (Events)

Все события содержат полную сущность `Call` (с подгруженными relations).

| Класс события        | Когда эмитится                                   |
|-----------------------|--------------------------------------------------|
| `CallInitiatedEvent`  | Звонок создан, статус `RINGING`                  |
| `CallAnsweredEvent`   | Callee ответил, статус `ACTIVE`                  |
| `CallDeclinedEvent`   | Callee отклонил, статус `DECLINED`               |
| `CallEndedEvent`      | Участник завершил, статус `ENDED`                |
| `CallMissedEvent`     | Caller отменил вызов, статус `MISSED`            |

Все события эмитятся синхронно через `EventBus.emit()`.

---

## Socket-интеграция

Модуль интегрируется с Socket.IO двумя способами:

### 1. CallListener (доменные события -> Socket-уведомления)

Реализует `ISocketEventListener`. Подписывается на доменные события и отправляет Socket-сообщения участникам через `SocketEmitterService.toUser()`.

| Доменное событие      | Socket-событие    | Получатель          |
|-----------------------|-------------------|---------------------|
| `CallInitiatedEvent`  | `call:incoming`   | callee              |
| `CallAnsweredEvent`   | `call:answered`   | caller              |
| `CallDeclinedEvent`   | `call:declined`   | caller              |
| `CallEndedEvent`      | `call:ended`      | caller и callee     |
| `CallMissedEvent`     | `call:missed`     | callee              |

Payload всех Socket-событий -- `CallDto`.

### 2. CallHandler (WebRTC-сигнализация)

Реализует `ISocketHandler`. Обрабатывает входящие Socket-события для WebRTC peer-to-peer соединения и пересылает их целевому пользователю.

| Входящее событие       | Исходящее событие     | Данные                                              |
|------------------------|-----------------------|-----------------------------------------------------|
| `call:offer`           | `call:offer`          | `{ callId, fromUserId, sdp }`                       |
| `call:answer`          | `call:answer`         | `{ callId, fromUserId, sdp }`                       |
| `call:ice-candidate`   | `call:ice-candidate`  | `{ callId, fromUserId, candidate }`                 |
| `call:hangup`          | `call:ended`          | `{ callId, endedBy }`                               |

Все сообщения пересылаются целевому пользователю (`targetUserId`) через `SocketEmitterService.toUser()`.

---

## Репозиторий: `CallRepository`

Наследуется от `BaseRepository<Call>`. Декорирован `@InjectableRepository(Call)` (автоматическая регистрация в IoC).

### Кастомные методы

| Метод                | Описание                                                                 |
|----------------------|--------------------------------------------------------------------------|
| `findById(id)`       | Поиск звонка по ID с загрузкой caller/callee и их профилей               |
| `findActiveCalls(userId)` | Поиск звонков со статусом RINGING/ACTIVE, где пользователь -- участник |
| `findCallHistory(userId, limit, offset)` | Пагинированная история звонков с подгрузкой профилей       |

---

## Валидация

### `InitiateCallSchema` (Zod)

```typescript
z.object({
  calleeId: z.string().uuid("Некорректный UUID"),
  chatId: z.string().uuid("Некорректный UUID").optional(),
  type: z.nativeEnum(ECallType).default(ECallType.VOICE),
})
```

Применяется через декоратор `@ValidateBody(InitiateCallSchema)` на эндпоинте `POST /api/call`.

---

## Зависимости

### Импортируемые модули и сервисы

| Зависимость            | Модуль     | Использование                              |
|------------------------|------------|--------------------------------------------|
| `EventBus`             | Core       | Публикация доменных событий из сервиса     |
| `SocketEmitterService` | Socket     | Отправка Socket-сообщений из listener/handler |
| `User` entity          | User       | Связь caller/callee (ManyToOne)            |
| `Chat` entity          | Chat       | Связь с чатом (ManyToOne, nullable)        |
| `BaseRepository`       | Core       | Базовый класс репозитория                  |
| `BaseDto`              | Core       | Базовый класс DTO                          |

### Регистрация в модуле

```typescript
@Module({
  providers: [
    CallRepository,
    CallService,
    CallController,
    asSocketHandler(CallHandler),
    asSocketListener(CallListener),
  ],
})
export class CallModule {}
```

`CallHandler` регистрируется через `asSocketHandler()`, `CallListener` -- через `asSocketListener()` для автоматической интеграции с Socket-инфраструктурой.

---

## Взаимодействие с другими модулями

- **User** -- caller и callee являются пользователями. Entity `Call` имеет ManyToOne связи с `User`. При удалении пользователя все его звонки каскадно удаляются.
- **Chat** -- звонок может быть привязан к чату (необязательно). При удалении чата поле `chatId` обнуляется (`SET NULL`).
- **Socket** -- модуль использует `SocketEmitterService` для отправки уведомлений и WebRTC-сигналов. `CallHandler` обрабатывает входящие Socket-события, `CallListener` транслирует доменные события в Socket-уведомления.
- **Core (EventBus)** -- `CallService` эмитит доменные события, которые подхватываются `CallListener` и могут быть подхвачены другими модулями.

---

## Тесты

Файл: `call.service.test.ts`

Покрытие: unit-тесты `CallService` с mock-репозиторием и mock-EventBus (sinon). Тестируются:

- **initiateCall** -- создание звонка, проверка запрета звонить себе, проверка конфликта активных звонков (caller и callee)
- **answerCall** -- ответ на звонок, проверка прав (только callee), проверка статуса, обработка несуществующего звонка
- **declineCall** -- отклонение callee (DECLINED) и отмена caller (MISSED), проверка прав участника
- **endCall** -- завершение звонка, вычисление duration, проверка статуса, проверка прав, обработка несуществующего звонка
- **getCallHistory** -- пагинация, значения по умолчанию
- **getActiveCall** -- наличие/отсутствие активного звонка
