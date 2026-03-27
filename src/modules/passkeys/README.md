# Модуль Passkeys (WebAuthn)

Модуль реализует регистрацию и аутентификацию пользователей с использованием стандарта **WebAuthn / FIDO2 Passkeys**. Позволяет пользователям привязывать аппаратные или платформенные аутентификаторы (Touch ID, Face ID, Windows Hello, аппаратные ключи) к своему аккаунту и использовать их для беспарольного входа.

Под капотом используется библиотека `@simplewebauthn/server`.

---

## Структура файлов модуля

```
src/modules/passkeys/
├── index.ts                    # Реэкспорт публичных элементов модуля
├── passkey.entity.ts           # TypeORM-сущность Passkey
├── passkeys.controller.ts      # REST-контроллер (tsoa)
├── passkeys.dto.ts             # DTO-интерфейсы запросов и ответов
├── passkeys.module.ts          # Декларация @Module для IoC
├── passkeys.repository.ts      # Репозиторий для работы с passkey-записями
├── passkeys.service.ts         # Бизнес-логика регистрации и аутентификации
└── passkeys.service.test.ts    # Юнит-тесты сервиса (Mocha + Sinon)
```

---

## Entity: `Passkey`

Таблица: `passkeys`

### Поля

| Поле          | Тип БД      | Описание                                                                 |
|---------------|-------------|--------------------------------------------------------------------------|
| `id`          | `varchar` (PK) | Credential ID, выданный аутентификатором                              |
| `publicKey`   | `bytea`     | Публичный ключ аутентификатора в формате COSE (хранится как `Uint8Array`, конвертируется в/из `Buffer`) |
| `userId`      | `uuid`      | Идентификатор пользователя-владельца                                     |
| `counter`     | `int`       | Счетчик использования для защиты от replay-атак                          |
| `deviceType`  | `varchar`   | Тип устройства: `singleDevice` (привязан к одному устройству) или `multiDevice` (синхронизированный). По умолчанию `singleDevice` |
| `transports`  | `simple-array` | Массив поддерживаемых транспортов аутентификатора (`internal`, `usb`, `ble`, `nfc` и т.д.). Nullable |
| `lastUsed`    | `timestamp` | Дата последнего использования passkey для входа. Nullable                 |
| `createdAt`   | `timestamp` | Дата создания (автоматически)                                            |
| `updatedAt`   | `timestamp` | Дата обновления (автоматически)                                          |

### Индексы

- `IDX_PASSKEYS_USER_ID` -- по полю `userId`

### Связи

| Связь         | Тип          | Целевая сущность | Описание                                                    |
|---------------|--------------|-------------------|-------------------------------------------------------------|
| `user`        | `ManyToOne`  | `User`            | Владелец passkey. При удалении пользователя passkey удаляется каскадно (`onDelete: CASCADE`) |

В сущности `User` есть обратная связь `OneToMany` через поле `passkeys`, а также служебные поля `challenge` и `challengeExpiresAt` для хранения текущего WebAuthn challenge между шагами flow.

---

## Endpoints (Controller)

Базовый путь: `/api/passkeys`
Тег: `Passkeys`

### 1. Генерация параметров регистрации passkey

| Параметр   | Значение                                  |
|------------|-------------------------------------------|
| Метод      | `POST`                                    |
| Путь       | `/api/passkeys/generate-registration-options` |
| Security   | `@Security("jwt")` -- требуется авторизация |
| Тело       | --                                        |
| Ответ      | `PublicKeyCredentialCreationOptionsJSON`   |

Генерирует параметры, которые клиент передает в `navigator.credentials.create()`. Passkey привязывается к текущему авторизованному пользователю. Существующие passkeys пользователя передаются в `excludeCredentials`, чтобы браузер не предлагал уже зарегистрированные аутентификаторы.

### 2. Верификация регистрации passkey

| Параметр   | Значение                                  |
|------------|-------------------------------------------|
| Метод      | `POST`                                    |
| Путь       | `/api/passkeys/verify-registration`       |
| Security   | `@Security("jwt")` -- требуется авторизация |
| Тело       | `IVerifyRegistrationRequestDto`           |
| Ответ      | `IVerifyRegistrationResponseDto`          |

Принимает ответ от `navigator.credentials.create()`, верифицирует его и сохраняет новый passkey в базу данных. Challenge сбрасывается после успешной верификации.

### 3. Генерация параметров аутентификации

| Параметр   | Значение                                  |
|------------|-------------------------------------------|
| Метод      | `POST`                                    |
| Путь       | `/api/passkeys/generate-authentication-options` |
| Security   | Нет (публичный endpoint)                  |
| Тело       | `IGenerateAuthenticationOptionsRequestDto`|
| Ответ      | `PublicKeyCredentialRequestOptionsJSON`    |

Принимает `login` (email или телефон), находит пользователя и его passkeys. Генерирует параметры для `navigator.credentials.get()`. Не раскрывает информацию о существовании пользователя -- при отсутствии пользователя или passkeys выбрасывается одинаковая ошибка `"Passkey не найден"`.

### 4. Верификация аутентификации

| Параметр   | Значение                                  |
|------------|-------------------------------------------|
| Метод      | `POST`                                    |
| Путь       | `/api/passkeys/verify-authentication`     |
| Security   | Нет (публичный endpoint)                  |
| Тело       | `IVerifyAuthenticationRequestDto`         |
| Ответ      | `IVerifyAuthenticationResponseDto`        |

Принимает ответ от `navigator.credentials.get()`, находит passkey по credential ID, верифицирует ответ. При успехе обновляет счетчик и дату последнего использования passkey, выдает JWT-токены (access + refresh).

---

## Сервис: `PasskeysService`

Основной класс бизнес-логики модуля. Инжектирует `UserService`, `TokenService` и `PasskeysRepository`.

### Конфигурация

Параметры Relying Party загружаются из `config.auth.webAuthn`:

- `rpName` -- имя Relying Party
- `rpID` -- хост RP (используется для проверки origin)
- `rpSchema` + `rpHost` + `rpPort` -- формируют `origin` для верификации

### Основные методы

| Метод                            | Описание                                                                 |
|----------------------------------|--------------------------------------------------------------------------|
| `generateRegistrationOptions(userId)` | Загружает пользователя и его существующие passkeys, генерирует параметры регистрации через `@simplewebauthn/server`, сохраняет challenge в User |
| `verifyRegistration(userId, data)` | Проверяет challenge (наличие + срок действия), верифицирует ответ регистрации, сохраняет новый passkey, сбрасывает challenge |
| `generateAuthenticationOptions(login)` | Ищет пользователя по email (если содержит `@`) или телефону, загружает его passkeys, генерирует параметры аутентификации, сохраняет challenge |
| `verifyAuthentication(data)` | Находит passkey по credential ID, проверяет challenge пользователя, верифицирует ответ, обновляет counter и lastUsed, выдает токены через `TokenService.issue()` |

### Обработка ошибок

- `InternalServerErrorException` -- отсутствие email/телефона у пользователя, отсутствие или истечение challenge, ошибки верификации
- `NotFoundException` -- пользователь или passkey не найден (намеренно не раскрывается, какой именно ресурс отсутствует, для безопасности)

### Challenge-механизм

Challenge (случайная строка) генерируется при вызове `generate*Options` и сохраняется в поле `User.challenge` через `UserService.setChallenge()`. Имеет TTL 5 минут (`challengeExpiresAt`). Сбрасывается после успешной верификации или при обнаружении истечения срока.

---

## DTO

### `IGenerateAuthenticationOptionsRequestDto`

```typescript
{
  login: string;  // Email или телефон пользователя
}
```

### `IVerifyRegistrationRequestDto`

```typescript
{
  data: RegistrationResponseJSON;  // Ответ от navigator.credentials.create()
}
```

### `IVerifyAuthenticationRequestDto`

```typescript
{
  data: AuthenticationResponseJSON;  // Ответ от navigator.credentials.get()
}
```

### `IVerifyRegistrationResponseDto`

```typescript
{
  verified: boolean;  // Успешность верификации
}
```

### `IVerifyAuthenticationResponseDto`

```typescript
{
  verified: boolean;     // Успешность верификации
  tokens?: ITokensDto;  // JWT-токены (access + refresh), только при verified=true
}
```

Типы `RegistrationResponseJSON` и `AuthenticationResponseJSON` приходят из `@simplewebauthn/types`.

---

## События (Events)

Модуль **не генерирует** доменных событий через `EventBus`.

---

## Socket-интеграция

Модуль **не имеет** Socket.IO интеграции.

---

## Репозиторий: `PasskeysRepository`

Расширяет `BaseRepository<Passkey>`, использует `@InjectableRepository(Passkey)` для автоматической привязки к IoC-контейнеру.

### Методы

| Метод                                | Описание                                            |
|--------------------------------------|-----------------------------------------------------|
| `findById(id: string)`              | Найти passkey по credential ID                      |
| `findByUserId(userId: string)`      | Получить все passkeys пользователя                  |
| `findByUserIdAndId(userId, id)`     | Найти конкретный passkey по пользователю и credential ID |

---

## Зависимости

### Импортируемые модули/сервисы

| Зависимость       | Источник          | Использование                                           |
|--------------------|-------------------|---------------------------------------------------------|
| `UserService`      | Модуль `user`     | Получение пользователя, поиск по email/телефону, управление challenge |
| `TokenService`     | `core`            | Выпуск JWT-токенов при успешной аутентификации           |
| `config.auth.webAuthn` | `config.ts`  | Параметры Relying Party (rpName, rpHost, rpSchema, rpPort) |

### Внешние библиотеки

| Библиотека                  | Использование                                     |
|-----------------------------|---------------------------------------------------|
| `@simplewebauthn/server`    | Генерация и верификация параметров WebAuthn        |
| `@simplewebauthn/types`     | Типы: `RegistrationResponseJSON`, `AuthenticationResponseJSON`, `AuthenticatorTransportFuture`, `PublicKeyCredentialCreationOptionsJSON`, `PublicKeyCredentialRequestOptionsJSON` |

---

## Взаимодействие с другими модулями

### User (двусторонняя связь)

- **Entity-уровень**: `Passkey.user` -> `ManyToOne` -> `User`; `User.passkeys` -> `OneToMany` -> `Passkey`
- **Сервис-уровень**: `PasskeysService` вызывает `UserService.getUser()`, `UserService.getUserByAttr()` и `UserService.setChallenge()` для управления WebAuthn challenge. Поля `challenge` и `challengeExpiresAt` в сущности `User` существуют исключительно для поддержки passkey-flow.

### Auth / Token (core)

- `TokenService.issue(user)` вызывается при успешной аутентификации для выдачи JWT-пары (access + refresh token). Это позволяет passkey-аутентификации быть полноценной альтернативой аутентификации по паролю.

---

## Тесты

Файл: `passkeys.service.test.ts`

Юнит-тесты покрывают error-path сценарии сервиса:

- `generateRegistrationOptions` -- ошибка при отсутствии email/телефона
- `verifyRegistration` -- ошибка при отсутствии challenge, при истекшем challenge, при невалидных данных верификации
- `generateAuthenticationOptions` -- NotFoundException при отсутствии пользователя (по email и телефону), при отсутствии passkeys, проброс неожиданных ошибок
- `verifyAuthentication` -- NotFoundException при отсутствии passkey, ошибка при отсутствии/истечении challenge, ошибка верификации

Используются: `Mocha`, `Chai`, `Sinon` (стабы для зависимостей).

---

## Flow-диаграмма

### Регистрация passkey (авторизованный пользователь)

```
Клиент                          Сервер
  |                                |
  |-- POST /generate-registration-options -->|
  |  [JWT в заголовке]             |-- генерирует options, сохраняет challenge в User
  |<-- PublicKeyCredentialCreationOptionsJSON --|
  |                                |
  |-- navigator.credentials.create(options) --|  (браузер)
  |                                |
  |-- POST /verify-registration -->|
  |  [JWT + RegistrationResponseJSON]|-- верифицирует, сохраняет Passkey
  |<-- { verified: true }          |
```

### Аутентификация по passkey (публичный)

```
Клиент                          Сервер
  |                                |
  |-- POST /generate-authentication-options -->|
  |  [login: email/телефон]        |-- ищет пользователя, генерирует options
  |<-- PublicKeyCredentialRequestOptionsJSON --|
  |                                |
  |-- navigator.credentials.get(options) --|  (браузер)
  |                                |
  |-- POST /verify-authentication -->|
  |  [AuthenticationResponseJSON]  |-- верифицирует, выдает JWT-токены
  |<-- { verified, tokens }        |
```
