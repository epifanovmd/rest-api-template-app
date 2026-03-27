# Модуль Biometric

Модуль биометрической аутентификации. Позволяет регистрировать устройства с криптографическими ключами (отпечаток пальца, Face ID) и проходить аутентификацию через challenge-response схему с цифровой подписью.

## Структура файлов

```
src/modules/biometric/
├── biometric.module.ts          # Объявление модуля (@Module)
├── biometric.entity.ts          # Entity биометрии (таблица biometrics)
├── biometric.repository.ts      # Репозиторий
├── biometric.service.ts         # Сервис биометрической аутентификации
├── biometric.controller.ts      # REST-контроллер (tsoa)
├── biometric.dto.ts             # DTO интерфейсы
├── biometric.service.test.ts    # Тесты
└── index.ts                     # Публичный API модуля
```

## Entity

### Biometric (таблица `biometrics`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `userId` | `uuid` | ID пользователя |
| `deviceId` | `varchar(100)` | Идентификатор устройства |
| `publicKey` | `text` | Публичный ключ устройства |
| `deviceName` | `varchar(100)`, nullable | Название устройства |
| `challenge` | `varchar`, nullable | Текущий nonce для проверки |
| `challengeExpiresAt` | `timestamp`, nullable | Время истечения challenge |
| `lastUsedAt` | `timestamp`, nullable | Время последнего использования |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Индексы:** `IDX_BIOMETRICS_USER_DEVICE` — уникальный составной (userId, deviceId)

**Связи:** `ManyToOne` -> `User` (`onDelete: CASCADE`)

## Endpoints

Базовый путь: `/api/biometric`

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `POST` | `/api/biometric/register` | `@Security("jwt")` | Зарегистрировать биометрические ключи устройства. Upsert. Макс. 5 устройств. |
| `POST` | `/api/biometric/generate-nonce` | `@Security("jwt")` | Сгенерировать nonce для подписи (TTL 5 мин). |
| `POST` | `/api/biometric/verify-signature` | `@Security("jwt")` | Проверить подпись и получить JWT-токены. |
| `GET` | `/api/biometric/devices` | `@Security("jwt")` | Список зарегистрированных устройств. |
| `DELETE` | `/api/biometric/{deviceId}` | `@Security("jwt")` | Удалить устройство. |

## Сервисы

### BiometricService

| Метод | Описание |
|-------|----------|
| `registerBiometric(userId, deviceId, deviceName, publicKey)` | Регистрация/обновление устройства. Лимит 5 устройств на пользователя. |
| `generateNonce(userId, deviceId)` | Генерация challenge (32 байта base64url, TTL 5 мин). |
| `verifyBiometricSignature(userId, deviceId, signature)` | Проверка SHA256 подписи. При успехе: создание сессии, выдача JWT-токенов. |
| `getDevices(userId)` | Список устройств. |
| `deleteDevice(userId, deviceId)` | Удалить устройство. |

## DTO

- **IRegisterBiometricRequestDto** — deviceId, deviceName, publicKey
- **IRegisterBiometricResponseDto** — `{ registered: boolean }`
- **IGenerateNonceRequestDto** — deviceId
- **IGenerateNonceResponseDto** — `{ nonce: string }`
- **IVerifyBiometricSignatureRequestDto** — deviceId, signature
- **IVerifyBiometricSignatureResponseDto** — `{ verified: boolean, tokens: { accessToken, refreshToken } }`
- **IBiometricDevicesResponseDto** — `{ devices: IBiometricDeviceDto[] }`
- **IDeleteBiometricResponseDto** — `{ deleted: boolean }`

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `UserService` | `modules/user` | Получение пользователя для выдачи токенов |
| `TokenService` | `core` | Генерация JWT-токенов |
| `SessionService` | `modules/session` | Создание сессии |
| `crypto` | Node.js | Генерация nonce, верификация подписи |
