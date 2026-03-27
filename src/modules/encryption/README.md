# Модуль Encryption

Модуль End-to-End шифрования на основе протокола Signal (X3DH + Double Ratchet). Управляет ключами устройств, одноразовыми prekeys и обеспечивает key exchange между пользователями через WebSocket.

## Структура файлов

```
src/modules/encryption/
├── encryption.module.ts              # Объявление модуля (@Module)
├── user-key.entity.ts                # Entity ключей устройства (таблица user_keys)
├── one-time-prekey.entity.ts         # Entity одноразовых prekeys (таблица one_time_prekeys)
├── user-key.repository.ts            # Репозиторий ключей устройств
├── one-time-prekey.repository.ts     # Репозиторий одноразовых prekeys
├── encryption.service.ts             # Сервис управления ключами
├── encryption.controller.ts          # REST-контроллер (tsoa)
├── encryption.handler.ts             # Socket-обработчик (key exchange, ratchet)
├── encryption.listener.ts            # Слушатель событий EventBus -> Socket
├── dto/
│   └── encryption.dto.ts             # KeyBundleDto
├── events/
│   ├── device-revoked.event.ts       # DeviceRevokedEvent
│   ├── prekeys-low.event.ts          # PrekeysLowEvent
│   └── index.ts                      # Реэкспорт событий
├── validation/
│   └── upload-keys.validate.ts       # UploadKeysSchema, UploadPreKeysSchema
└── encryption.service.test.ts        # Тесты
```

## Entities

### UserKey (таблица `user_keys`)

Ключи устройства пользователя для E2E-шифрования.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `userId` | `uuid` | ID пользователя |
| `deviceId` | `varchar(100)` | Идентификатор устройства |
| `identityKey` | `text` | Identity key |
| `signedPreKeyId` | `int` | ID signed prekey |
| `signedPreKeyPublic` | `text` | Публичный signed prekey |
| `signedPreKeySignature` | `text` | Подпись signed prekey |
| `isActive` | `boolean`, default `true` | Активен ли ключ |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Индексы:**
- `IDX_USER_KEYS_USER_DEVICE` — уникальный составной (userId, deviceId)
- `IDX_USER_KEYS_USER` — по userId

**Связи:** `ManyToOne` -> `User` (`onDelete: CASCADE`)

### OneTimePreKey (таблица `one_time_prekeys`)

Одноразовые prekeys для установки E2E-сессии.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `userId` | `uuid` | ID пользователя |
| `keyId` | `int` | Числовой ID ключа |
| `publicKey` | `text` | Публичный ключ |
| `isUsed` | `boolean`, default `false` | Использован ли ключ |
| `createdAt` | `timestamp` | Дата создания |

**Индексы:**
- `IDX_OTP_USER_UNUSED` — составной (userId, isUsed)
- `IDX_OTP_USER_KEY` — уникальный составной (userId, keyId)

**Связи:** `ManyToOne` -> `User` (`onDelete: CASCADE`)

## Endpoints

Базовый путь: `/api/encryption`

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `POST` | `/api/encryption/keys` | `@Security("jwt")` + `@ValidateBody(UploadKeysSchema)` | Загрузить ключи устройства (identity + signed prekey + one-time prekeys). Upsert по (userId, deviceId). |
| `GET` | `/api/encryption/keys/{userId}` | `@Security("jwt")` | Получить key bundle пользователя для установки E2E-сессии. Потребляет один one-time prekey. |
| `POST` | `/api/encryption/keys/prekeys` | `@Security("jwt")` + `@ValidateBody(UploadPreKeysSchema)` | Загрузить дополнительные one-time prekeys. Возвращает `{ availableCount }`. |
| `DELETE` | `/api/encryption/keys/{deviceId}` | `@Security("jwt")` | Отозвать ключи устройства (isActive = false). |

## Сервисы

### EncryptionService

| Метод | Описание |
|-------|----------|
| `uploadKeys(userId, data)` | Upsert ключей устройства + загрузка one-time prekeys |
| `getKeyBundle(targetUserId)` | Получить key bundle (потребляет prekey). Эмитит `PrekeysLowEvent` если осталось < 10 prekeys. |
| `uploadPreKeys(userId, keys)` | Загрузить дополнительные prekeys. Возвращает количество доступных. |
| `revokeDevice(userId, deviceId)` | Деактивировать устройство. Эмитит `DeviceRevokedEvent`. |

## DTO

- **KeyBundleDto** — userId, deviceId, identityKey, signedPreKey (id, publicKey, signature), oneTimePreKey (id, publicKey) | null

## События (Events)

| Событие | Данные | Когда |
|---------|--------|-------|
| `DeviceRevokedEvent` | `userId`, `deviceId` | При отзыве ключей устройства |
| `PrekeysLowEvent` | `userId`, `remainingCount` | Когда доступных prekeys < 10 |

## Socket-интеграция

### EncryptionHandler (ISocketHandler)

| Событие (входящее) | Описание |
|--------------------|----------|
| `e2e:key-exchange` | Отправка key bundle целевому пользователю. Проверяет членство обоих участников в чате. |
| `e2e:ratchet` | Рассылка нового публичного ключа в комнату чата (кроме отправителя). |

### EncryptionListener (ISocketEventListener)

| Событие EventBus | Socket-событие | Получатель | Данные |
|------------------|----------------|------------|--------|
| `PrekeysLowEvent` | `e2e:prekeys-low` | пользователь | `{ count }` |
| `DeviceRevokedEvent` | `e2e:device-revoked` | пользователь | `{ deviceId }` |

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `User` entity | `modules/user` | Связь в entities |
| `ChatMemberRepository` | `modules/chat` | Проверка членства в чате (EncryptionHandler) |
| `EventBus` | `core` | Публикация и подписка на события |
| `SocketEmitterService` | `modules/socket` | Отправка socket-событий |
