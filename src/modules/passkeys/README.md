# Модуль Passkeys (WebAuthn)

Модуль регистрации и аутентификации через стандарт WebAuthn / FIDO2 Passkeys. Поддерживает привязку аппаратных и платформенных аутентификаторов (Touch ID, Face ID, Windows Hello) и беспарольный вход. Использует библиотеку `@simplewebauthn/server`.

## Структура файлов

```
src/modules/passkeys/
├── passkeys.module.ts           # Объявление модуля (@Module)
├── passkey.entity.ts            # Entity passkey (таблица passkeys)
├── passkeys.repository.ts       # Репозиторий
├── passkeys.service.ts          # Сервис WebAuthn
├── passkeys.controller.ts       # REST-контроллер (tsoa)
├── passkeys.dto.ts              # DTO интерфейсы
├── passkeys.service.test.ts     # Тесты
└── index.ts                     # Публичный API модуля
```

## Entity

### Passkey (таблица `passkeys`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `varchar` (PK) | Credential ID |
| `publicKey` | `bytea` | Публичный ключ в формате COSE |
| `userId` | `uuid` | ID пользователя |
| `counter` | `int` | Счётчик для защиты от replay-атак |
| `deviceType` | `varchar`, default `singleDevice` | Тип: singleDevice / multiDevice |
| `transports` | `jsonb`, nullable | Поддерживаемые транспорты |
| `lastUsed` | `timestamp`, nullable | Время последнего использования |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Индексы:** `IDX_PASSKEYS_USER_ID` — по userId

**Связи:** `ManyToOne` -> `User` (`onDelete: CASCADE`)

## Endpoints

Базовый путь: `/api/passkeys`

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `POST` | `/api/passkeys/generate-registration-options` | `@Security("jwt")` | Параметры для регистрации нового passkey. Исключает уже зарегистрированные. |
| `POST` | `/api/passkeys/verify-registration` | `@Security("jwt")` | Верификация ответа устройства и сохранение passkey. |
| `POST` | `/api/passkeys/generate-authentication-options` | публичный | Параметры для аутентификации. Принимает login (email/телефон). |
| `POST` | `/api/passkeys/verify-authentication` | публичный | Верификация аутентификации и выдача JWT-токенов. |

## Сервисы

### PasskeysService

| Метод | Описание |
|-------|----------|
| `generateRegistrationOptions(userId)` | Генерация параметров регистрации. Challenge сохраняется в User. |
| `verifyRegistration(userId, data)` | Верификация ответа. Сохранение passkey в БД. |
| `generateAuthenticationOptions(login)` | Генерация параметров аутентификации по email/телефону. |
| `verifyAuthentication(data)` | Верификация ответа. Обновление counter. Создание сессии + выдача JWT. |

Конфигурация: `config.auth.webAuthn` (rpName, rpHost, rpSchema, rpPort).

## DTO

- **IVerifyRegistrationRequestDto** — `{ data: RegistrationResponseJSON }`
- **IVerifyRegistrationResponseDto** — `{ verified: boolean }`
- **IGenerateAuthenticationOptionsRequestDto** — `{ login: string }`
- **IVerifyAuthenticationRequestDto** — `{ data: AuthenticationResponseJSON }`
- **IVerifyAuthenticationResponseDto** — `{ verified: boolean, tokens?: ITokensDto }`

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `@simplewebauthn/server` | npm | WebAuthn-операции |
| `UserService` | `modules/user` | Получение пользователя, хранение challenge |
| `TokenService` | `core` | Генерация JWT-токенов |
| `SessionService` | `modules/session` | Создание сессии при аутентификации |
| `config.auth.webAuthn` | `config` | Параметры Relying Party |
