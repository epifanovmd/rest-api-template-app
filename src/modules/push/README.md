# Модуль Push

Модуль push-уведомлений через Firebase Cloud Messaging (FCM). Управляет регистрацией устройств, настройками уведомлений и отправкой push offline-пользователям. Отправка идёт через очередь `push.send`.

## Структура файлов

```
src/modules/push/
├── push.module.ts                          # Объявление модуля (@Module)
├── device-token.entity.ts                  # Entity токена устройства (таблица device_tokens)
├── notification-settings.entity.ts         # Entity настроек уведомлений (таблица notification_settings)
├── device-token.repository.ts              # Репозиторий токенов устройств
├── notification-settings.repository.ts     # Репозиторий настроек уведомлений
├── push.service.ts                         # Постановка в очередь и доставка push (Firebase)
├── push-send.job.ts                        # PushSendJob — обработчик очереди push.send
├── push.errors.ts                          # PushError — коды PUSH_*
├── push.permissions.ts                     # PushPermissions (definePermissions("push"))
├── device-token.service.ts                 # Сервис управления токенами устройств
├── notification-settings.service.ts        # Сервис настроек уведомлений
├── device.controller.ts                    # REST-контроллер устройств
├── notification-settings.controller.ts     # REST-контроллер настроек уведомлений
├── push.types.ts                           # EDevicePlatform, IPushPayload, данные задачи push.send
├── push.listener.ts                        # Слушатель событий -> push + socket
├── dto/
│   ├── push.dto.ts                         # DeviceTokenDto, NotificationSettingsDto
│   └── index.ts                            # Реэкспорт DTO
├── events/
│   ├── notification-settings-changed.event.ts # NotificationSettingsChangedEvent
│   └── index.ts                            # Реэкспорт событий
├── validation/
│   ├── register-device.validate.ts         # RegisterDeviceSchema
│   ├── update-notification-settings.validate.ts # UpdateNotificationSettingsSchema
│   └── index.ts                            # Реэкспорт валидаций
├── push.service.test.ts                    # Тесты PushService
├── device-token.service.test.ts            # Тесты DeviceTokenService
├── notification-settings.service.test.ts   # Тесты NotificationSettingsService
├── push.listener.test.ts                   # Тесты PushListener
├── notification-settings.repository.test.ts # Тест upsert настроек
└── index.ts                                # Публичный API модуля
```

## Entities

### DeviceToken (таблица `device_tokens`)

| Поле                      | Тип                      | Описание                                                        |
| ------------------------- | ------------------------ | --------------------------------------------------------------- |
| `id`                      | `uuid` (PK)              | Уникальный идентификатор                                        |
| `userId`                  | `uuid`                   | ID пользователя (FK users, CASCADE)                             |
| `sessionId`               | `uuid`                   | Сессия, из которой зарегистрирован токен (FK sessions, CASCADE) |
| `token`                   | `varchar(512)`, unique   | FCM-токен устройства                                            |
| `platform`                | `enum(EDevicePlatform)`  | Платформа (ios/android/web)                                     |
| `deviceName`              | `varchar(100)`, nullable | Название устройства                                             |
| `createdAt` / `updatedAt` | `timestamp`              | Временные метки                                                 |

**Индексы:**

- `IDX_DEVICE_TOKENS_USER` — по userId
- `IDX_DEVICE_TOKENS_SESSION` — по sessionId
- `IDX_DEVICE_TOKENS_TOKEN` — уникальный по token

### NotificationSettings (таблица `notification_settings`)

| Поле           | Тип                        | Описание                    |
| -------------- | -------------------------- | --------------------------- |
| `id`           | `uuid` (PK)                | Уникальный идентификатор    |
| `userId`       | `uuid` (unique)            | ID пользователя             |
| `muteAll`      | `boolean`, default `false` | Отключить все уведомления   |
| `soundEnabled` | `boolean`, default `true`  | Звук уведомлений            |
| `showPreview`  | `boolean`, default `true`  | Показывать превью сообщений |

**Индексы:** `IDX_NOTIFICATION_SETTINGS_USER` — уникальный по userId

## Endpoints

### Устройства (`/api/v1/device`)

| Метод    | Путь                  | Security                                                   | Описание                                                                                                                                                                     |
| -------- | --------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/device`         | `@Security("jwt")` + `@ValidateBody(RegisterDeviceSchema)` | Зарегистрировать устройство и привязать к текущей сессии. Свой токен обновляется; токен другого пользователя — старая привязка удаляется (с записью в лог), создаётся новая. |
| `DELETE` | `/api/device/{token}` | `@Security("jwt")`                                         | Удалить своё устройство. 204; чужой или несуществующий токен — 404 `PUSH_DEVICE_NOT_FOUND`.                                                                                  |

### Настройки (`/api/v1/notification`)

| Метод   | Путь                         | Security                                                               | Описание                                                                |
| ------- | ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET`   | `/api/notification/settings` | `@Security("jwt")`                                                     | Получить настройки уведомлений (без записи в БД: нет строки — дефолты). |
| `PATCH` | `/api/notification/settings` | `@Security("jwt")` + `@ValidateBody(UpdateNotificationSettingsSchema)` | Обновить настройки.                                                     |

## Сервисы

### PushService

Firebase Admin SDK инициализируется из `config.firebase.serviceAccountPath`; без него
push отключён (задачи не ставятся).

| Метод                           | Описание                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `sendToUser(userId, payload)`   | То же, что `sendToUsers([userId], payload)`.                                            |
| `sendToUsers(userIds, payload)` | Ставит задачу `push.send` `{ userIds, payload }` (без повторов id). Сама не отправляет. |
| `deliver(data)`                 | Доставка — **только для обработчика `push.send`**. См. ниже.                            |

`deliver` для `{ userIds, payload }` читает токены и настройки получателей: `muteAll` —
пропуск; `showPreview = false` — вместо title/body `payload.hiddenPreview` или общий
текст; `soundEnabled` — `android.notification.sound = "default"` и
`apns.payload.aps.sound = "default"`, иначе без звука. Токены группируются по
настройкам — одна multicast-рассылка на группу.

Результат рассылки:

- `messaging/invalid-registration-token`, `messaging/registration-token-not-registered`
  — токен удаляется (как раньше);
- временные ошибки (`internal-error`, `server-unavailable`, `unknown-error`,
  `message-rate-exceeded`) и недоступность FCM целиком — эти токены уходят новой
  задачей `push.send` `{ deliveries: [{ tokens, message }], retry }` с задержкой
  30 с · 2^retry, до `PUSH_MAX_RETRIES = 5` раз. Уже доставленным повтор не приходит;
- прочие ошибки токена — пропуск.

## Задачи

| Очередь     | Данные                                                                  | Политика                                                                                                                 |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `push.send` | `{ userIds, payload }` или `{ deliveries, retry }` (`TPushSendJobData`) | `retryLimit` 3, 10 с, backoff, срок 120 с — на сбой до отправки (чтение токенов); частичный сбой FCM — отдельной задачей |

Обработчик — `PushSendJob` (`asJobHandler` в `push.module.ts`). Не удалось поставить
повтор — `JobError(PUSH_DELIVERY_FAILED, retryable: false)`.

### DeviceTokenService

| Метод                                                            | Описание                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `registerToken(userId, sessionId, token, platform, deviceName?)` | Привязка токена к пользователю и сессии (перепривязка чужого — через удаление старой записи). |
| `unregisterToken(userId, token)`                                 | Удалить свой токен; иначе `PUSH_DEVICE_NOT_FOUND` (404).                                      |
| `removeBySession(sessionId)`                                     | Удалить токены сессии.                                                                        |

### NotificationSettingsService

| Метод                          | Описание                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `getSettings(userId)`          | Настройки; при отсутствии строки — дефолты без записи.                                              |
| `updateSettings(userId, data)` | Атомарный upsert по `user_id` (`ON CONFLICT DO UPDATE`). Эмитит `NotificationSettingsChangedEvent`. |

## Ошибки (`PushError`, коды `PUSH_*`)

| Код                     | Статус | Когда                                       |
| ----------------------- | ------ | ------------------------------------------- |
| `PUSH_DEVICE_NOT_FOUND` | 404    | удаление чужого/несуществующего токена      |
| `PUSH_DELIVERY_FAILED`  | 503    | код `JobError`: не удалось поставить повтор |

## Права

`PushPermissions = definePermissions("push", { MANAGE: "push:manage" })`.

## Конфиг

`FIREBASE_SERVICE_ACCOUNT_PATH` — путь к ключу сервисного аккаунта (от корня проекта).

## DTO

- **DeviceTokenDto** — id, token, platform, deviceName, createdAt
- **NotificationSettingsDto** — muteAll, soundEnabled, showPreview

## События (Events)

| Событие                            | Данные   | Когда                               |
| ---------------------------------- | -------- | ----------------------------------- |
| `NotificationSettingsChangedEvent` | `userId` | При обновлении настроек уведомлений |

## Socket-интеграция

### PushListener (ISocketEventListener)

| Событие EventBus                   | Действие                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MessageCreatedEvent`              | Push offline-участникам чата (кроме отправителя и muted). С `hiddenPreview` без имени отправителя и текста. Отдельный push для @-упоминаний (bypass mute). |
| `ContactRequestEvent`              | Push offline-получателю запроса на контакт.                                                                                                                |
| `SessionTerminatedEvent`           | Удаление push-токенов завершённой сессии (дублирует FK CASCADE для явного завершения).                                                                     |
| `NotificationSettingsChangedEvent` | Socket-событие `push:settings-changed` пользователю.                                                                                                       |

## Перечисления

```typescript
enum EDevicePlatform {
  IOS = "ios",
  ANDROID = "android",
  WEB = "web",
}
```

## Зависимости

| Зависимость                         | Откуда            | Использование                                          |
| ----------------------------------- | ----------------- | ------------------------------------------------------ |
| `firebase-admin`                    | npm               | Отправка push через FCM                                |
| `ChatMemberRepository`              | `modules/chat`    | Проверка мьюта чата                                    |
| `SocketClientRegistry`              | `modules/socket`  | Проверка isOnline                                      |
| `SocketEmitterService`              | `modules/socket`  | Socket-уведомление                                     |
| `MessageCreatedEvent`               | `modules/message` | Триггер push для сообщений                             |
| `ContactRequestEvent`               | `modules/contact` | Триггер push для контактов                             |
| `SessionTerminatedEvent`, `Session` | `modules/session` | Удаление токенов сессии; FK `device_tokens.session_id` |
| `EventBus`                          | `core`            | Подписка на события                                    |
| `JobQueue`                          | `core`            | Очередь `push.send` (реализация — модуль jobs)         |
