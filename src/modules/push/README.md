# Push-модуль

Модуль push-уведомлений. Отвечает за регистрацию устройств пользователей (FCM-токенов), управление настройками уведомлений и отправку push-уведомлений через Firebase Cloud Messaging. Поддерживает отправку одному или нескольким пользователям с учётом их персональных настроек (mute, звук, превью).

---

## Структура файлов

```
src/modules/push/
├── push.module.ts                        # Декларация модуля
├── push.types.ts                         # Перечисления (EDevicePlatform)
├── push.service.ts                       # Основной сервис отправки push через Firebase
├── push.listener.ts                      # Слушатель доменных событий (EventBus → push)
├── device-token.entity.ts                # Entity: токен устройства
├── device-token.repository.ts            # Репозиторий токенов устройств
├── device-token.service.ts               # Сервис управления токенами устройств
├── device.controller.ts                  # REST-контроллер регистрации/удаления устройств
├── notification-settings.entity.ts       # Entity: настройки уведомлений пользователя
├── notification-settings.repository.ts   # Репозиторий настроек уведомлений
├── notification-settings.service.ts      # Сервис управления настройками уведомлений
├── notification-settings.controller.ts   # REST-контроллер настроек уведомлений
├── dto/
│   ├── push.dto.ts                       # DTO: DeviceTokenDto, NotificationSettingsDto
│   └── index.ts                          # Реэкспорт DTO
├── validation/
│   ├── register-device.validate.ts       # Zod-схема регистрации устройства
│   ├── update-notification-settings.validate.ts  # Zod-схема обновления настроек
│   └── index.ts                          # Реэкспорт валидаций
├── push.service.test.ts                  # Тесты PushService
├── push.listener.test.ts                 # Тесты PushListener
├── device-token.service.test.ts          # Тесты DeviceTokenService
├── notification-settings.service.test.ts # Тесты NotificationSettingsService
└── index.ts                              # Публичный реэкспорт модуля
```

---

## Entity

### DeviceToken

Таблица: `device_tokens`

Хранит FCM-токены устройств пользователей для отправки push-уведомлений.

| Поле         | Тип                    | Описание                              |
|--------------|------------------------|---------------------------------------|
| `id`         | `uuid` (PK)           | Уникальный идентификатор записи       |
| `userId`     | `uuid` (FK → User)    | Идентификатор пользователя            |
| `token`      | `varchar(512)`, unique | FCM-токен устройства                  |
| `platform`   | `enum(EDevicePlatform)`| Платформа: `ios`, `android`, `web`    |
| `deviceName` | `varchar(100)`, null   | Название устройства (опционально)     |
| `createdAt`  | `timestamp`            | Дата создания                         |
| `updatedAt`  | `timestamp`            | Дата обновления                       |

**Связи:**
- `ManyToOne → User` (по `user_id`, `onDelete: CASCADE`) — при удалении пользователя все его токены удаляются

**Индексы:**
- `IDX_DEVICE_TOKENS_USER` — по `userId`
- `IDX_DEVICE_TOKENS_TOKEN` — по `token` (unique)

### NotificationSettings

Таблица: `notification_settings`

Персональные настройки уведомлений пользователя.

| Поле           | Тип               | По умолчанию | Описание                                |
|----------------|--------------------|--------------|-----------------------------------------|
| `id`           | `uuid` (PK)       | —            | Уникальный идентификатор записи         |
| `userId`       | `uuid` (FK → User)| —            | Идентификатор пользователя (unique)     |
| `muteAll`      | `boolean`          | `false`      | Отключить все уведомления               |
| `soundEnabled` | `boolean`          | `true`       | Включён ли звук уведомлений             |
| `showPreview`  | `boolean`          | `true`       | Показывать ли текст в превью            |

**Связи:**
- `OneToOne → User` (по `user_id`, `onDelete: CASCADE`) — при удалении пользователя настройки удаляются

**Индексы:**
- `IDX_NOTIFICATION_SETTINGS_USER` — по `userId` (unique)

---

## Endpoints

### DeviceController — `api/device`

Тег Swagger: **Push**

| Метод    | Путь               | Описание                                      | Security     | Валидация              |
|----------|---------------------|-----------------------------------------------|--------------|------------------------|
| `POST`   | `api/device`       | Зарегистрировать устройство для push           | `@Security("jwt")` | `RegisterDeviceSchema` |
| `DELETE` | `api/device/{token}`| Удалить устройство из push-уведомлений         | `@Security("jwt")` | —                      |

**POST api/device** — тело запроса:
```json
{
  "token": "string (1-512 символов, обязательно)",
  "platform": "ios | android | web",
  "deviceName": "string (до 100 символов, опционально)"
}
```
Возвращает: `DeviceTokenDto`

**DELETE api/device/{token}** — удаляет токен по строковому значению. Возвращает `void`.

### NotificationSettingsController — `api/notification`

Тег Swagger: **Push**

| Метод   | Путь                       | Описание                                | Security     | Валидация                          |
|---------|-----------------------------|-----------------------------------------|--------------|------------------------------------|
| `GET`   | `api/notification/settings`| Получить настройки уведомлений           | `@Security("jwt")` | —                                  |
| `PATCH` | `api/notification/settings`| Обновить настройки уведомлений           | `@Security("jwt")` | `UpdateNotificationSettingsSchema` |

**GET api/notification/settings** — возвращает `NotificationSettingsDto`. Если настроек ещё нет, автоматически создаёт запись с дефолтными значениями.

**PATCH api/notification/settings** — тело запроса (все поля опциональны):
```json
{
  "muteAll": "boolean",
  "soundEnabled": "boolean",
  "showPreview": "boolean"
}
```
Возвращает: `NotificationSettingsDto`

---

## Сервисы

### PushService

Основной сервис отправки push-уведомлений через Firebase Admin SDK.

**Инициализация:**
- При создании пытается инициализировать Firebase Admin SDK из пути, указанного в `config.firebase.serviceAccountPath`
- Если путь не задан или инициализация не удалась, push-уведомления отключаются (все методы отправки становятся no-op)

**Методы:**

| Метод                                        | Описание                                                                     |
|----------------------------------------------|------------------------------------------------------------------------------|
| `sendToUser(userId, payload)`                | Отправить push одному пользователю. Проверяет `muteAll` в настройках         |
| `sendToUsers(userIds[], payload)`            | Отправить push нескольким пользователям. Фильтрует тех, у кого `muteAll=true`|

**Payload (`IPushPayload`):**
```typescript
{
  title: string;
  body: string;
  data?: Record<string, string>;
}
```

**Логика очистки невалидных токенов:**
После каждой отправки проверяет ответ Firebase. Токены с ошибками `messaging/invalid-registration-token` или `messaging/registration-token-not-registered` автоматически удаляются из базы.

### DeviceTokenService

Управление FCM-токенами устройств.

| Метод                                                 | Описание                                                                 |
|-------------------------------------------------------|--------------------------------------------------------------------------|
| `registerToken(userId, token, platform, deviceName?)` | Upsert: если токен существует — обновляет `userId`/`platform`/`deviceName`, иначе создаёт новый |
| `unregisterToken(token)`                              | Удаляет токен по строковому значению                                     |
| `getTokensForUser(userId)`                            | Возвращает все токены пользователя в виде `DeviceTokenDto[]`             |

### NotificationSettingsService

Управление настройками уведомлений пользователя.

| Метод                              | Описание                                                                        |
|------------------------------------|---------------------------------------------------------------------------------|
| `getSettings(userId)`              | Возвращает настройки. Если не найдены — автоматически создаёт с дефолтами       |
| `updateSettings(userId, data)`     | Обновляет настройки (upsert). Принимает частичный объект (`muteAll`, `soundEnabled`, `showPreview`) |

---

## DTO

### DeviceTokenDto

| Поле         | Тип                | Описание                    |
|--------------|--------------------|-----------------------------|
| `id`         | `string`           | UUID записи                 |
| `token`      | `string`           | FCM-токен                   |
| `platform`   | `EDevicePlatform`  | Платформа устройства        |
| `deviceName` | `string \| null`   | Название устройства         |
| `createdAt`  | `Date`             | Дата регистрации            |

### NotificationSettingsDto

| Поле           | Тип       | Описание                         |
|----------------|-----------|----------------------------------|
| `muteAll`      | `boolean` | Все уведомления отключены        |
| `soundEnabled` | `boolean` | Звук уведомлений включён         |
| `showPreview`  | `boolean` | Превью текста в уведомлениях     |

---

## Типы

### EDevicePlatform

```typescript
enum EDevicePlatform {
  IOS = "ios",
  ANDROID = "android",
  WEB = "web",
}
```

---

## Валидация (Zod)

### RegisterDeviceSchema

| Поле         | Правила                                                   |
|--------------|-----------------------------------------------------------|
| `token`      | `string`, min 1, max 512                                  |
| `platform`   | `nativeEnum(EDevicePlatform)` — `ios`, `android` или `web`|
| `deviceName` | `string`, max 100, опционально                            |

### UpdateNotificationSettingsSchema

| Поле           | Правила               |
|----------------|------------------------|
| `muteAll`      | `boolean`, опционально |
| `soundEnabled` | `boolean`, опционально |
| `showPreview`  | `boolean`, опционально |

---

## События (Events) и Socket-интеграция

### PushListener

`PushListener` реализует интерфейс `ISocketEventListener` и регистрируется через `asSocketListener()` в модуле. Подписывается на доменные события через `EventBus` и отправляет push-уведомления офлайн-пользователям.

#### Обрабатываемые события:

**1. `MessageCreatedEvent`** (из модуля `message`)

Срабатывает при создании нового сообщения в чате. Логика:

1. Определяет офлайн-участников чата (исключая отправителя и онлайн-пользователей через `SocketClientRegistry.isOnline()`)
2. Фильтрует замьюченных пользователей — проверяет `ChatMember.mutedUntil` через `ChatMemberRepository`
3. Отправляет push незамьюченным офлайн-участникам:
   - `title` — имя отправителя (`sender.profile.firstName`) или "Новое сообщение"
   - `body` — первые 100 символов текста, или "Зашифрованное сообщение" для зашифрованных, или "Медиа-сообщение"
   - `data` — `{ type: "message", chatId, messageId }`
4. Для упоминаний (`mentionedUserIds` или `mentionAll`) — отдельно отправляет push замьюченным пользователям, которых упомянули (обход мьюта):
   - `title` — `"<имя> упомянул вас"`
   - `data.type` — `"mention"`

**2. `ContactRequestEvent`** (из модуля `contact`)

Срабатывает при отправке запроса на добавление в контакты. Логика:

1. Проверяет, находится ли целевой пользователь онлайн через `SocketClientRegistry.isOnline()`
2. Если офлайн — отправляет push:
   - `title` — "Новый контакт"
   - `body` — "Вам отправлен запрос на добавление в контакты"
   - `data` — `{ type: "contact_request", contactId }`

---

## Зависимости

### Внутренние зависимости модуля (providers)

- `DeviceTokenRepository` — репозиторий токенов устройств
- `NotificationSettingsRepository` — репозиторий настроек уведомлений
- `PushService` — сервис отправки push (зависит от обоих репозиториев)
- `DeviceTokenService` — сервис токенов (зависит от `DeviceTokenRepository`)
- `NotificationSettingsService` — сервис настроек (зависит от `NotificationSettingsRepository`)
- `DeviceController` — REST-контроллер устройств
- `NotificationSettingsController` — REST-контроллер настроек
- `PushListener` — слушатель событий (зарегистрирован как socket listener)

### Внешние зависимости

| Модуль      | Что используется                            | Где                |
|-------------|---------------------------------------------|--------------------|
| `core`      | `EventBus`, `Injectable`, `InjectableRepository`, `ValidateBody`, `getContextUser`, `BaseRepository`, `BaseDto` | Везде       |
| `socket`    | `ISocketEventListener`, `SocketClientRegistry`, `asSocketListener` | `PushListener`, `push.module.ts` |
| `chat`      | `ChatMemberRepository` — проверка `mutedUntil` для участников чата | `PushListener`     |
| `message`   | `MessageCreatedEvent` — событие создания сообщения               | `PushListener`     |
| `contact`   | `ContactRequestEvent` — событие запроса контакта                 | `PushListener`     |
| `user`      | `User` entity — связь `ManyToOne` / `OneToOne` в entity         | `DeviceToken`, `NotificationSettings` |
| `firebase-admin` | Firebase Admin SDK для отправки FCM-сообщений               | `PushService`      |
| `config`    | `config.firebase.serviceAccountPath` — путь к файлу сервисного аккаунта | `PushService` |

---

## Взаимодействие с другими модулями

```
┌──────────────┐    MessageCreatedEvent     ┌──────────────┐
│   Message    │ ─────────────────────────→ │              │
│   Module     │                            │              │
└──────────────┘                            │              │
                                            │    Push      │
┌──────────────┐    ContactRequestEvent     │   Listener   │──→ PushService ──→ Firebase FCM
│   Contact    │ ─────────────────────────→ │              │
│   Module     │                            │              │
└──────────────┘                            └──────┬───────┘
                                                   │
                                            ┌──────┴───────┐
                                            │SocketClient  │  (проверка онлайн-статуса)
                                            │Registry      │
                                            └──────────────┘
                                                   │
                                            ┌──────┴───────┐
                                            │ChatMember    │  (проверка mute-статуса)
                                            │Repository    │
                                            └──────────────┘
```

**Модуль не импортирует другие модули через `@Module.imports`** — все зависимости разрешаются через IoC-контейнер (InversifyJS). Это значит, что `ChatMemberRepository`, `SocketClientRegistry` и др. должны быть зарегистрированы в контейнере другими модулями до использования.

### Кто использует Push-модуль

Push-модуль является «конечным потребителем» событий — он реагирует на события из других модулей, но сам событий не генерирует. Другие модули не зависят от Push-модуля напрямую.

---

## Тесты

Модуль содержит 4 файла тестов:

| Файл                                  | Покрытие                                                         |
|---------------------------------------|------------------------------------------------------------------|
| `push.service.test.ts`                | Отправка одному/нескольким пользователям, фильтрация mute, очистка невалидных токенов |
| `device-token.service.test.ts`        | Регистрация (создание/upsert), удаление, получение токенов       |
| `notification-settings.service.test.ts`| Получение (с автосозданием), обновление настроек                |
| `push.listener.test.ts`               | Push при сообщениях (офлайн, мьют, упоминания, шифрование), push при запросе контакта |
