# Модуль Encryption

## Описание

Модуль сквозного шифрования (E2E encryption), реализующий управление криптографическими ключами по протоколу Signal (X3DH / Double Ratchet). Обеспечивает загрузку, хранение и выдачу ключей устройств пользователей, а также обмен ключами и ratchet-сообщениями через WebSocket.

---

## Структура файлов

```
src/modules/encryption/
├── user-key.entity.ts              # Entity ключей устройства пользователя
├── one-time-prekey.entity.ts       # Entity одноразовых prekey
├── user-key.repository.ts          # Репозиторий UserKey
├── one-time-prekey.repository.ts   # Репозиторий OneTimePreKey
├── encryption.service.ts           # Бизнес-логика управления ключами
├── encryption.controller.ts        # REST-контроллер (tsoa)
├── encryption.handler.ts           # Socket-обработчик E2E событий
├── encryption.module.ts            # Объявление модуля
├── encryption.service.test.ts      # Юнит-тесты сервиса
├── dto/
│   └── encryption.dto.ts           # DTO ответа (KeyBundleDto)
└── validation/
    └── upload-keys.validate.ts     # Zod-схемы валидации входных данных
```

---

## Entities

### UserKey

Таблица: `user_keys`

Хранит криптографические ключи устройства пользователя (identity key + signed prekey).

| Поле                  | Тип       | Описание                                |
|-----------------------|-----------|-----------------------------------------|
| `id`                  | uuid (PK) | Первичный ключ                          |
| `userId`              | uuid (FK) | ID пользователя                         |
| `deviceId`            | varchar(100) | Идентификатор устройства             |
| `identityKey`         | text      | Публичный identity key (Base64)         |
| `signedPreKeyId`      | int       | ID signed prekey                        |
| `signedPreKeyPublic`  | text      | Публичный signed prekey                 |
| `signedPreKeySignature` | text    | Подпись signed prekey                   |
| `isActive`            | boolean   | Активен ли ключ (default: true)         |
| `createdAt`           | timestamp | Дата создания                           |
| `updatedAt`           | timestamp | Дата обновления                         |

**Связи:**
- `ManyToOne` -> `User` (по `userId`, ON DELETE CASCADE)

**Индексы:**
- `IDX_USER_KEYS_USER_DEVICE` — уникальный индекс по `(userId, deviceId)`
- `IDX_USER_KEYS_USER` — индекс по `userId`

### OneTimePreKey

Таблица: `one_time_prekeys`

Хранит одноразовые prekey для установки E2E-сессий. Каждый ключ используется однократно.

| Поле        | Тип       | Описание                           |
|-------------|-----------|------------------------------------|
| `id`        | uuid (PK) | Первичный ключ                     |
| `userId`    | uuid (FK) | ID пользователя                    |
| `keyId`     | int       | Идентификатор prekey на устройстве |
| `publicKey` | text      | Публичный ключ                     |
| `isUsed`    | boolean   | Использован ли (default: false)    |
| `createdAt` | timestamp | Дата создания                      |

**Связи:**
- `ManyToOne` -> `User` (по `userId`, ON DELETE CASCADE)

**Индексы:**
- `IDX_OTP_USER_UNUSED` — индекс по `(userId, isUsed)` для быстрого поиска доступных ключей
- `IDX_OTP_USER_KEY` — уникальный индекс по `(userId, keyId)`

---

## Endpoints

Базовый путь: `/api/encryption`

| Метод    | Путь                  | Описание                                                        | Security     |
|----------|-----------------------|-----------------------------------------------------------------|--------------|
| `POST`   | `/keys`               | Загрузить ключи устройства (identity + signed prekey + one-time prekeys) | `@Security("jwt")` |
| `GET`    | `/keys/{userId}`      | Получить key bundle пользователя для установки E2E-сессии       | `@Security("jwt")` |
| `POST`   | `/keys/prekeys`       | Загрузить дополнительные one-time prekeys                       | `@Security("jwt")` |
| `DELETE` | `/keys/{deviceId}`    | Отозвать ключи устройства (деактивировать)                      | `@Security("jwt")` |

Все эндпоинты требуют JWT-аутентификацию без дополнительных permission-ограничений — любой авторизованный пользователь может управлять своими ключами.

### POST /keys

Загружает полный набор ключей устройства. Если ключи для пары `(userId, deviceId)` уже существуют — обновляет их (upsert). Одноразовые prekey создаются только если ещё не существуют (дедупликация по `keyId`).

**Тело запроса:**
```json
{
  "deviceId": "device-1",
  "identityKey": "base64-encoded-key",
  "signedPreKey": {
    "id": 1,
    "publicKey": "base64-encoded-key",
    "signature": "base64-encoded-signature"
  },
  "oneTimePreKeys": [
    { "id": 100, "publicKey": "base64-encoded-key" },
    { "id": 101, "publicKey": "base64-encoded-key" }
  ]
}
```

**Ответ:** `void` (204)

### GET /keys/{userId}

Возвращает key bundle целевого пользователя. One-time prekey при выдаче помечается как использованный (`isUsed = true`). Если одноразовые ключи закончились — поле `oneTimePreKey` будет `null`.

**Ответ:** `KeyBundleDto`

### POST /keys/prekeys

Пополняет запас одноразовых prekey. Дедупликация по `keyId`.

**Тело запроса:**
```json
{
  "keys": [
    { "id": 200, "publicKey": "base64-encoded-key" },
    { "id": 201, "publicKey": "base64-encoded-key" }
  ]
}
```

**Ответ:**
```json
{ "availableCount": 15 }
```

### DELETE /keys/{deviceId}

Деактивирует ключи устройства (`isActive = false`). Ключи не удаляются из базы.

**Ответ:** `void` (204)

---

## Сервис (EncryptionService)

### Зависимости
- `UserKeyRepository` — работа с ключами устройств
- `OneTimePreKeyRepository` — работа с одноразовыми prekey

### Методы

| Метод                      | Описание                                                                                   |
|----------------------------|--------------------------------------------------------------------------------------------|
| `uploadKeys(userId, data)` | Upsert ключей устройства + создание one-time prekeys (с дедупликацией)                     |
| `getKeyBundle(targetUserId)` | Получение key bundle: identity key, signed prekey, один доступный one-time prekey (или null) |
| `uploadPreKeys(userId, keys)` | Пополнение одноразовых prekeys, возвращает количество доступных                          |
| `revokeDevice(userId, deviceId)` | Деактивация ключей устройства (`isActive = false`)                                   |

**Ошибки:**
- `NotFoundException` — если у целевого пользователя нет зарегистрированных активных ключей (при `getKeyBundle`)

---

## DTO

### KeyBundleDto

Ответ на запрос key bundle для установки E2E-сессии.

```typescript
interface KeyBundleDto {
  userId: string;
  deviceId: string;
  identityKey: string;
  signedPreKey: {
    id: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKey: {
    id: number;
    publicKey: string;
  } | null;
}
```

---

## Валидация

Входные данные валидируются Zod-схемами через декоратор `@ValidateBody`.

### UploadKeysSchema

| Поле             | Правила                                    |
|------------------|--------------------------------------------|
| `deviceId`       | string, min 1, max 100 символов            |
| `identityKey`    | string, min 1                              |
| `signedPreKey.id` | int                                       |
| `signedPreKey.publicKey` | string, min 1                      |
| `signedPreKey.signature` | string, min 1                      |
| `oneTimePreKeys` | массив объектов `{id: int, publicKey: string}`, от 1 до 100 элементов |

### UploadPreKeysSchema

| Поле   | Правила                                                    |
|--------|------------------------------------------------------------|
| `keys` | массив объектов `{id: int, publicKey: string}`, от 1 до 100 элементов |

---

## Socket-интеграция

### EncryptionHandler

Реализует интерфейс `ISocketHandler` и обрабатывает WebSocket-события для обмена E2E-ключами в реальном времени.

Регистрируется через `asSocketHandler(EncryptionHandler)` в модуле.

### Обрабатываемые события

| Событие            | Входные данные                                      | Действие                                                                 |
|--------------------|-----------------------------------------------------|--------------------------------------------------------------------------|
| `e2e:key-exchange` | `{ chatId, targetUserId, keyBundle }`               | Пересылает key bundle целевому пользователю через `SocketEmitterService.toUser()` |
| `e2e:ratchet`      | `{ chatId, newPublicKey }`                          | Рассылает новый публичный ключ всем участникам комнаты `chat_{chatId}` кроме отправителя |

### Исходящие события

| Событие            | Данные                                              | Получатель                        |
|--------------------|-----------------------------------------------------|-----------------------------------|
| `e2e:key-exchange` | `{ chatId, fromUserId, keyBundle }`                 | Конкретный пользователь (toUser)  |
| `e2e:ratchet`      | `{ chatId, fromUserId, newPublicKey }`              | Комната `chat_{chatId}` (broadcast) |

---

## События (EventBus)

Модуль не использует EventBus и не эмитит доменных событий.

---

## Зависимости

### Импортируемые модули/сервисы

| Зависимость           | Источник            | Назначение                                      |
|-----------------------|---------------------|-------------------------------------------------|
| `User` entity         | Модуль `user`       | Связь `ManyToOne` в обеих entities              |
| `SocketEmitterService`| Модуль `socket`     | Отправка WebSocket-событий в `EncryptionHandler`|
| `ISocketHandler`      | Модуль `socket`     | Интерфейс для socket-обработчика                |
| `asSocketHandler()`   | Модуль `socket`     | Утилита регистрации socket handler в IoC        |

### Зависимости из core

- `Injectable`, `InjectableRepository`, `ValidateBody`, `getContextUser` — core-декораторы и утилиты
- `BaseRepository` — базовый класс репозитория
- `Module` — декоратор модуля

---

## Взаимодействие с другими модулями

- **User** — entity `UserKey` и `OneTimePreKey` связаны с `User` через `ManyToOne` (каскадное удаление: при удалении пользователя все его ключи удаляются)
- **Socket** — `EncryptionHandler` использует `SocketEmitterService` для пересылки ключей между пользователями в реальном времени. Обрабатывает события `e2e:key-exchange` и `e2e:ratchet`
- **Auth** — все REST-эндпоинты защищены `@Security("jwt")`, используют `getContextUser()` для определения текущего пользователя

---

## Тесты

Файл: `encryption.service.test.ts`

Покрыты все методы `EncryptionService`:
- `uploadKeys` — создание нового ключа, обновление существующего, дедупликация one-time prekeys
- `getKeyBundle` — с one-time prekey, без one-time prekey (null), NotFoundException при отсутствии ключей
- `uploadPreKeys` — добавление новых, пропуск существующих, возврат количества доступных
- `revokeDevice` — деактивация ключа, обработка несуществующего устройства

Используется: Mocha + Chai + Sinon с моками репозиториев.
