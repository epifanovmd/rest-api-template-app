# Модуль Push

Модуль push-уведомлений через Firebase Cloud Messaging (FCM). Управляет регистрацией устройств, настройками уведомлений и отправкой push offline-пользователям.

## Структура файлов

```
src/modules/push/
├── push.module.ts                          # Объявление модуля (@Module)
├── device-token.entity.ts                  # Entity токена устройства (таблица device_tokens)
├── notification-settings.entity.ts         # Entity настроек уведомлений (таблица notification_settings)
├── device-token.repository.ts              # Репозиторий токенов устройств
├── notification-settings.repository.ts     # Репозиторий настроек уведомлений
├── push.service.ts                         # Сервис отправки push (Firebase)
├── device-token.service.ts                 # Сервис управления токенами устройств
├── notification-settings.service.ts        # Сервис настроек уведомлений
├── device.controller.ts                    # REST-контроллер устройств
├── notification-settings.controller.ts     # REST-контроллер настроек уведомлений
├── push.types.ts                           # Перечисления (EDevicePlatform)
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
└── index.ts                                # Публичный API модуля
```

## Entities

### DeviceToken (таблица `device_tokens`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `userId` | `uuid` | ID пользователя |
| `token` | `varchar(512)`, unique | FCM-токен устройства |
| `platform` | `enum(EDevicePlatform)` | Платформа (ios/android/web) |
| `deviceName` | `varchar(100)`, nullable | Название устройства |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Индексы:**
- `IDX_DEVICE_TOKENS_USER` — по userId
- `IDX_DEVICE_TOKENS_TOKEN` — уникальный по token

### NotificationSettings (таблица `notification_settings`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `userId` | `uuid` (unique) | ID пользователя |
| `muteAll` | `boolean`, default `false` | Отключить все уведомления |
| `soundEnabled` | `boolean`, default `true` | Звук уведомлений |
| `showPreview` | `boolean`, default `true` | Показывать превью сообщений |

**Индексы:** `IDX_NOTIFICATION_SETTINGS_USER` — уникальный по userId

## Endpoints

### Устройства (`/api/device`)

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `POST` | `/api/device` | `@Security("jwt")` + `@ValidateBody(RegisterDeviceSchema)` | Зарегистрировать устройство. Upsert по token. |
| `DELETE` | `/api/device/{token}` | `@Security("jwt")` | Удалить устройство. |

### Настройки (`/api/notification`)

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/notification/settings` | `@Security("jwt")` | Получить настройки уведомлений. |
| `PATCH` | `/api/notification/settings` | `@Security("jwt")` + `@ValidateBody(UpdateNotificationSettingsSchema)` | Обновить настройки. |

## Сервисы

### PushService

Отправка push-уведомлений через Firebase Admin SDK. Инициализируется из `config.firebase.serviceAccountPath`.

| Метод | Описание |
|-------|----------|
| `sendToUser(userId, payload)` | Push одному пользователю. Проверяет muteAll. |
| `sendToUsers(userIds, payload)` | Push нескольким пользователям. Фильтрует muted. Автоудаление невалидных FCM-токенов. |

### DeviceTokenService

| Метод | Описание |
|-------|----------|
| `registerToken(userId, token, platform, deviceName?)` | Upsert FCM-токена. |
| `unregisterToken(token)` | Удалить токен. |

### NotificationSettingsService

| Метод | Описание |
|-------|----------|
| `getSettings(userId)` | Получить настройки. Автосоздание при отсутствии. |
| `updateSettings(userId, data)` | Обновить настройки. Эмитит `NotificationSettingsChangedEvent`. |

## DTO

- **DeviceTokenDto** — id, token, platform, deviceName, createdAt
- **NotificationSettingsDto** — muteAll, soundEnabled, showPreview

## События (Events)

| Событие | Данные | Когда |
|---------|--------|-------|
| `NotificationSettingsChangedEvent` | `userId` | При обновлении настроек уведомлений |

## Socket-интеграция

### PushListener (ISocketEventListener)

| Событие EventBus | Действие |
|------------------|----------|
| `MessageCreatedEvent` | Push offline-участникам чата (кроме отправителя и muted). Для зашифрованных — "Зашифрованное сообщение". Отдельный push для @-упоминаний (bypass mute). |
| `ContactRequestEvent` | Push offline-получателю запроса на контакт. |
| `NotificationSettingsChangedEvent` | Socket-событие `push:settings-changed` пользователю. |

## Перечисления

```typescript
enum EDevicePlatform { IOS = "ios", ANDROID = "android", WEB = "web" }
```

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `firebase-admin` | npm | Отправка push через FCM |
| `ChatMemberRepository` | `modules/chat` | Проверка мьюта чата |
| `SocketClientRegistry` | `modules/socket` | Проверка isOnline |
| `SocketEmitterService` | `modules/socket` | Socket-уведомление |
| `MessageCreatedEvent` | `modules/message` | Триггер push для сообщений |
| `ContactRequestEvent` | `modules/contact` | Триггер push для контактов |
| `EventBus` | `core` | Подписка на события |
