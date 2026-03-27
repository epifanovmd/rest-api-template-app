# Модуль Biometric

Модуль биометрической аутентификации. Позволяет пользователям регистрировать устройства с биометрическими ключами (отпечаток пальца, Face ID и т.д.), а затем проходить аутентификацию через challenge-response схему с криптографической подписью.

## Структура файлов

```
src/modules/biometric/
├── biometric.entity.ts          # TypeORM-сущность биометрических записей
├── biometric.repository.ts      # Репозиторий для работы с БД
├── biometric.service.ts         # Бизнес-логика: регистрация, nonce, верификация
├── biometric.controller.ts      # REST-контроллер (tsoa), 5 endpoints
├── biometric.dto.ts             # Интерфейсы запросов и ответов
├── biometric.module.ts          # Декларация модуля (@Module)
├── biometric.service.test.ts    # Unit-тесты сервиса (Mocha + Sinon)
└── index.ts                     # Реэкспорт публичного API модуля
```

## Entity

### `Biometric` (таблица `biometrics`)

| Поле                 | Тип             | Описание                                           |
|----------------------|-----------------|----------------------------------------------------|
| `id`                 | `uuid` (PK)     | Уникальный идентификатор записи                    |
| `userId`             | `uuid` (FK)     | Ссылка на пользователя (`User.id`)                 |
| `deviceId`           | `varchar(100)`   | Идентификатор устройства (задается клиентом)       |
| `publicKey`          | `text`           | Публичный ключ устройства (base64)                 |
| `deviceName`         | `varchar(100)`   | Человекочитаемое название устройства (nullable)    |
| `challenge`          | `varchar`        | Текущий challenge (nonce) для подписи (nullable)   |
| `challengeExpiresAt` | `timestamp`      | Время истечения challenge (nullable)               |
| `lastUsedAt`         | `timestamp`      | Время последнего использования (nullable)          |
| `createdAt`          | `timestamp`      | Дата создания (auto)                               |
| `updatedAt`          | `timestamp`      | Дата обновления (auto)                             |

#### Индексы

- `IDX_BIOMETRICS_USER_DEVICE` -- уникальный составной индекс по `(userId, deviceId)`. Гарантирует, что один пользователь не может зарегистрировать одно устройство дважды.

#### Связи

| Связь       | Тип        | Целевая сущность | Описание                                        |
|-------------|------------|------------------|-------------------------------------------------|
| `user`      | `ManyToOne`| `User`           | Каскадное удаление (`onDelete: CASCADE`)        |

В сущности `User` есть обратная связь:
```typescript
@OneToMany(() => Biometric, biometric => biometric.user, { cascade: true })
biometrics: Biometric[];
```

## Endpoints (Controller)

Базовый путь: **`/api/biometric`**
Тег в Swagger: **Biometric**

Все endpoints требуют JWT-аутентификации (`@Security("jwt")`). `userId` извлекается из контекста токена через `getContextUser(req)`.

| Метод    | Путь                       | Описание                                                   | Request Body                            | Response                                |
|----------|----------------------------|------------------------------------------------------------|-----------------------------------------|-----------------------------------------|
| `POST`   | `/api/biometric/register`  | Регистрирует биометрический ключ устройства                | `IRegisterBiometricRequestDto`          | `IRegisterBiometricResponseDto`         |
| `POST`   | `/api/biometric/generate-nonce` | Генерирует nonce (challenge) для подписи на устройстве | `IGenerateNonceRequestDto`              | `IGenerateNonceResponseDto`             |
| `POST`   | `/api/biometric/verify-signature` | Проверяет подпись и выдает JWT-токены                | `IVerifyBiometricSignatureRequestDto`   | `IVerifyBiometricSignatureResponseDto`  |
| `GET`    | `/api/biometric/devices`   | Список зарегистрированных устройств пользователя           | --                                      | `IBiometricDevicesResponseDto`          |
| `DELETE` | `/api/biometric/{deviceId}`| Удаляет зарегистрированное устройство                      | --                                      | `IDeleteBiometricResponseDto`           |

## Сервис (BiometricService)

### Зависимости (inject)

- `UserService` -- получение данных пользователя для выпуска токенов
- `TokenService` -- выпуск JWT access/refresh токенов
- `BiometricRepository` -- доступ к данным биометрии

### Константы

- `CHALLENGE_TTL_MS` = 5 минут -- время жизни challenge (nonce)
- `MAX_DEVICES_PER_USER` = 5 -- максимальное количество устройств на пользователя

### Методы

#### `registerBiometric(userId, deviceId, deviceName, publicKey)`

Регистрирует биометрический ключ устройства. Если устройство уже зарегистрировано (по паре `userId + deviceId`) -- обновляет публичный ключ и имя. Если нет -- создает новую запись. Бросает `ConflictException`, если достигнут лимит устройств (5).

#### `generateNonce(userId, deviceId)`

Генерирует криптографически стойкий nonce (32 байта, base64url) и сохраняет его как `challenge` в записи биометрии с TTL 5 минут. Бросает `NotFoundException`, если устройство не зарегистрировано.

#### `verifyBiometricSignature(userId, deviceId, signature)`

Проверяет подпись challenge:
1. Находит запись биометрии по `userId + deviceId`
2. Проверяет наличие и срок действия challenge
3. Верифицирует подпись (SHA256 + RSA) с помощью публичного ключа устройства
4. При успехе -- инвалидирует challenge, обновляет `lastUsedAt`, выдает JWT-токены через `TokenService.issue()`

Возможные ошибки:
- `NotFoundException` -- устройство не зарегистрировано
- `InternalServerErrorException` -- challenge не найден, challenge истек, неверная подпись

#### `getDevices(userId)`

Возвращает список всех зарегистрированных устройств пользователя.

#### `deleteDevice(userId, deviceId)`

Удаляет устройство по `userId + deviceId`. Бросает `NotFoundException`, если устройство не найдено.

### Приватные методы

- `_verifySignature({ publicKey, message, signature })` -- верификация RSA подписи (SHA256) через Node.js `crypto.createVerify`
- `_convertPublicKeyToPEM(base64Key)` -- конвертация base64-ключа в формат PEM

## DTO

### Request DTO

#### `IRegisterBiometricRequestDto`

| Поле         | Тип      | Описание                       |
|--------------|----------|--------------------------------|
| `deviceId`   | `string` | Идентификатор устройства       |
| `deviceName` | `string` | Название устройства            |
| `publicKey`  | `string` | Публичный ключ (base64)        |

#### `IGenerateNonceRequestDto`

| Поле       | Тип      | Описание                 |
|------------|----------|--------------------------|
| `deviceId` | `string` | Идентификатор устройства |

#### `IVerifyBiometricSignatureRequestDto`

| Поле        | Тип      | Описание                       |
|-------------|----------|--------------------------------|
| `deviceId`  | `string` | Идентификатор устройства       |
| `signature` | `string` | Подпись challenge (base64)     |

### Response DTO

#### `IRegisterBiometricResponseDto`

| Поле         | Тип       | Описание                      |
|--------------|-----------|-------------------------------|
| `registered` | `boolean` | Успешность регистрации        |

#### `IGenerateNonceResponseDto`

| Поле    | Тип      | Описание              |
|---------|----------|-----------------------|
| `nonce` | `string` | Сгенерированный nonce |

#### `IVerifyBiometricSignatureResponseDto`

| Поле                    | Тип       | Описание                      |
|-------------------------|-----------|-------------------------------|
| `verified`              | `boolean` | Успешность верификации        |
| `tokens.accessToken`    | `string`  | JWT access-токен              |
| `tokens.refreshToken`   | `string`  | JWT refresh-токен             |

#### `IBiometricDevicesResponseDto`

| Поле      | Тип                    | Описание               |
|-----------|------------------------|------------------------|
| `devices` | `IBiometricDeviceDto[]`| Список устройств       |

#### `IBiometricDeviceDto`

| Поле         | Тип      | Описание                       |
|--------------|----------|--------------------------------|
| `id`         | `string` | ID записи                      |
| `deviceId`   | `string` | Идентификатор устройства       |
| `deviceName` | `string` | Название устройства            |
| `lastUsedAt` | `Date`   | Последнее использование        |
| `createdAt`  | `Date`   | Дата регистрации               |

#### `IDeleteBiometricResponseDto`

| Поле      | Тип       | Описание               |
|-----------|-----------|------------------------|
| `deleted` | `boolean` | Успешность удаления    |

## События (Events)

Модуль **не использует** EventBus и не генерирует доменных событий.

## Socket-интеграция

Модуль **не имеет** socket-интеграции.

## Зависимости

### Импортируемые модули

Модуль не импортирует другие модули через `@Module({ imports: [] })`. Зависимости разрешаются через IoC-контейнер:

| Зависимость          | Модуль          | Использование                                                |
|----------------------|-----------------|--------------------------------------------------------------|
| `UserService`        | `UserModule`    | Получение данных пользователя для выпуска токенов            |
| `TokenService`       | `Core (Auth)`   | Выпуск JWT access/refresh токенов при успешной верификации   |
| `BiometricRepository`| Текущий модуль  | Доступ к таблице `biometrics`                                |

### Инфраструктурные зависимости

- Node.js `crypto` -- генерация nonce (`randomBytes`), верификация RSA-подписей (`createVerify`)

## Взаимодействие с другими модулями

### Кто зависит от Biometric

Ни один внешний модуль не импортирует `BiometricModule` и не использует `BiometricService` напрямую. Модуль является "листовым" -- он предоставляет функциональность только через REST API.

### Связь с User

Сущность `User` содержит обратную связь `@OneToMany` на `Biometric` с каскадным удалением. При удалении пользователя все его биометрические записи удаляются автоматически (как через каскад TypeORM, так и через `onDelete: CASCADE` на уровне БД).

## Тесты

Файл `biometric.service.test.ts` содержит unit-тесты для `BiometricService` (Mocha + Chai + Sinon):

- **registerBiometric**: обновление существующего устройства, создание нового, ошибка при превышении лимита
- **generateNonce**: успешная генерация, ошибка при отсутствии устройства
- **verifyBiometricSignature**: ошибка при отсутствии устройства, отсутствии challenge, истекшем challenge, невалидной подписи
- **getDevices**: получение списка устройств
- **deleteDevice**: успешное удаление, ошибка при отсутствии устройства

## Флоу биометрической аутентификации

```
1. Пользователь авторизуется стандартным способом (логин/пароль)
2. POST /api/biometric/register -- регистрирует публичный ключ устройства
3. При следующем входе:
   a. POST /api/biometric/generate-nonce -- получает challenge
   b. Устройство подписывает challenge приватным ключом (биометрия)
   c. POST /api/biometric/verify-signature -- сервер верифицирует подпись
   d. При успехе -- получает JWT access/refresh токены
```
