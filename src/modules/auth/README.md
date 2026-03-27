# Модуль авторизации (Auth)

## Краткое описание

Модуль `Auth` отвечает за аутентификацию и авторизацию пользователей: регистрацию, вход в систему, сброс пароля, обновление JWT-токенов и двухфакторную аутентификацию (2FA). Модуль не имеет собственной entity — работает с entity `User` через `UserService`, `UserRepository` и управляет сессиями через `SessionService`.

---

## Структура файлов

```
src/modules/auth/
├── auth.controller.ts                  # REST-контроллер (tsoa), 8 endpoints
├── auth.dto.ts                         # Интерфейсы DTO (запросы и ответы)
├── auth.listener.ts                    # Socket-listener (ISocketEventListener)
├── auth.module.ts                      # Объявление модуля (@Module)
├── auth.service.ts                     # Бизнес-логика аутентификации
├── auth.service.test.ts                # Unit-тесты AuthService (Mocha + Sinon)
├── index.ts                            # Реэкспорт (controller, listener, module, service, events)
├── events/
│   ├── index.ts                        # Реэкспорт событий
│   ├── two-factor.event.ts             # TwoFactorEnabledEvent, TwoFactorDisabledEvent
│   └── user-logged-in.event.ts         # UserLoggedInEvent
└── validation/
    ├── auth-authenticate.validate.ts   # Zod-схема AuthenticateSchema
    ├── auth-refresh.validate.ts        # Zod-схема RefreshSchema
    ├── auth-reset-password.validate.ts # Zod-схемы RequestResetPasswordSchema, ResetPasswordSchema
    ├── auth-sign-in.validate.ts        # Zod-схема SignInSchema
    ├── auth-sign-up.validate.ts        # Zod-схема SignUpSchema
    ├── disable-2fa.validate.ts         # Zod-схема Disable2FASchema
    ├── enable-2fa.validate.ts          # Zod-схема Enable2FASchema
    ├── verify-2fa.validate.ts          # Zod-схема Verify2FASchema
    ├── auth.validation.test.ts         # Unit-тесты всех валидационных схем
    └── index.ts                        # Реэкспорт всех схем
```

---

## Entity

Модуль **не имеет собственной entity**. Работает с полями entity `User` через зависимости:

- `User.passwordHash` — хеш основного пароля (bcrypt, 12 раундов)
- `User.twoFactorHash` — хеш пароля 2FA (bcrypt, 12 раундов; `null` если 2FA отключена)
- `User.twoFactorHint` — текстовая подсказка для 2FA пароля (опционально, `null` по умолчанию)
- `User.email`, `User.phone` — используются для идентификации при входе и сбросе пароля

---

## Endpoints

Все endpoints находятся под базовым путем **`/api/auth`**, тег Swagger: **Authorization**.

| Метод | Путь | Описание | Security | Rate Limit | Валидация |
|-------|------|----------|----------|------------|-----------|
| `POST` | `/api/auth/sign-up` | Регистрация нового пользователя | Нет | 5 запросов / 60 сек | `SignUpSchema` |
| `POST` | `/api/auth/sign-in` | Вход в систему (email/телефон + пароль) | Нет | 10 запросов / 60 сек | `SignInSchema` |
| `POST` | `/api/auth/request-reset-password` | Запрос письма для сброса пароля | Нет | 3 запроса / 300 сек | `RequestResetPasswordSchema` |
| `POST` | `/api/auth/reset-password` | Сброс пароля по токену из письма | Нет | Нет | `ResetPasswordSchema` |
| `POST` | `/api/auth/refresh` | Обновление access/refresh токенов | Нет | Нет | `RefreshSchema` |
| `POST` | `/api/auth/enable-2fa` | Включение двухфакторной аутентификации | `@Security("jwt")` | Нет | `Enable2FASchema` |
| `POST` | `/api/auth/disable-2fa` | Отключение двухфакторной аутентификации | `@Security("jwt")` | Нет | `Disable2FASchema` |
| `POST` | `/api/auth/verify-2fa` | Верификация 2FA и получение токенов | Нет | Нет | `Verify2FASchema` |

### Подробности endpoints

#### POST /api/auth/sign-up
- **Вход:** `{ email?, phone?, password, firstName?, lastName? }` — обязателен либо `email`, либо `phone`
- **Выход:** `IUserWithTokensDto` — данные пользователя + `{ accessToken, refreshToken }`
- **Логика:** проверяет уникальность email/phone, создает пользователя, хеширует пароль (bcrypt, 12 раундов), вызывает `signIn` для создания сессии и выдачи токенов
- **Ошибки:** `400` — если email/phone уже зарегистрирован или не указан ни один из них

#### POST /api/auth/sign-in
- **Вход:** `{ login, password }` — `login` может быть email или телефоном
- **Выход:** `IUserWithTokensDto` или `I2FARequiredDto`
- **Логика:** определяет тип логина по наличию `@`, ищет пользователя (при неудаче пробует альтернативный тип), сравнивает пароль через bcrypt. Если у пользователя включена 2FA — возвращает `{ require2FA: true, twoFactorToken, twoFactorHint? }` вместо токенов. `twoFactorToken` — JWT со сроком 5 минут и `type: "2fa"`. При успешном входе без 2FA создает сессию через `SessionService`, выдает токены через `TokenService.issue()` и эмитит `UserLoggedInEvent`
- **Ошибки:** `401` — неверный логин или пароль

#### POST /api/auth/request-reset-password
- **Вход:** `{ login }` — email или телефон
- **Выход:** `ApiResponseDto` с сообщением
- **Логика:** ищет пользователя, создает токен сброса через `ResetPasswordTokensService`, отправляет email через `MailerService`. При отсутствии пользователя или отсутствии email у пользователя возвращает такой же успешный ответ (для защиты от перебора)

#### POST /api/auth/reset-password
- **Вход:** `{ token, password }`
- **Выход:** `ApiResponseDto` с сообщением об успехе
- **Логика:** валидирует токен через `ResetPasswordTokensService.check()`, меняет пароль через `UserService.changePassword()`, завершает все сессии пользователя через `SessionService.terminateAllByUser()`, эмитит `PasswordChangedEvent(userId, "reset")`

#### POST /api/auth/refresh
- **Вход:** `{ refreshToken }`
- **Выход:** `ITokensDto { accessToken, refreshToken }`
- **Логика:** верифицирует refresh-токен (`verifyToken`), находит сессию по refresh-токену через `SessionService.findByRefreshToken()`, проверяет соответствие `userId`, загружает пользователя, выдает новую пару токенов через `TokenService.issue()`, обновляет refresh-токен в сессии
- **Ошибки:** `401` — токен отсутствует, невалидный, просроченный или сессия не найдена

#### POST /api/auth/enable-2fa
- **Вход:** `{ password, hint? }` — пароль 2FA (отдельный от основного), опциональная подсказка
- **Security:** `@Security("jwt")` — требуется авторизация
- **Выход:** `ApiResponseDto` с сообщением об успехе
- **Логика:** проверяет, что 2FA еще не включена, хеширует пароль 2FA (bcrypt, 12 раундов), сохраняет `twoFactorHash` и `twoFactorHint` в `User` через `UserRepository.update()`, эмитит `TwoFactorEnabledEvent`
- **Ошибки:** `400` — если 2FA уже включена

#### POST /api/auth/disable-2fa
- **Вход:** `{ password }` — текущий пароль 2FA для подтверждения
- **Security:** `@Security("jwt")` — требуется авторизация
- **Выход:** `ApiResponseDto` с сообщением об успехе
- **Логика:** проверяет, что 2FA включена, сравнивает пароль через bcrypt, обнуляет `twoFactorHash` и `twoFactorHint` через `UserRepository.update()`, эмитит `TwoFactorDisabledEvent`
- **Ошибки:** `400` — 2FA не включена; `401` — неверный пароль 2FA

#### POST /api/auth/verify-2fa
- **Вход:** `{ twoFactorToken, password }` — JWT-токен из ответа `sign-in` + пароль 2FA
- **Выход:** `IUserWithTokensDto` — данные пользователя + токены
- **Логика:** верифицирует JWT (проверяет `type === "2fa"`), загружает пользователя, сравнивает пароль 2FA через bcrypt, создает сессию через `SessionService`, выдает токены, эмитит `UserLoggedInEvent`
- **Ошибки:** `401` — неверный токен или пароль 2FA; `400` — 2FA не включена для пользователя

---

## Сервис (AuthService)

Класс `AuthService` содержит всю бизнес-логику модуля. Декоратор `@Injectable()`.

### Зависимости (inject)

| Зависимость | Описание |
|-------------|----------|
| `UserService` | Поиск, создание пользователей, смена пароля |
| `MailerService` | Отправка email для сброса пароля |
| `ResetPasswordTokensService` | Создание и валидация токенов сброса пароля |
| `TokenService` | Выдача JWT access/refresh токенов |
| `UserRepository` | Прямое обновление полей 2FA в entity User |
| `EventBus` | Эмит доменных событий (UserLoggedInEvent, TwoFactorEnabledEvent и др.) |
| `SessionService` | Создание, поиск и управление сессиями пользователей |

### Методы

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `signUp` | `(body: TSignUpRequestDto, deviceInfo?: IDeviceInfo) => Promise<IUserWithTokensDto>` | Регистрация: проверка уникальности, создание пользователя, выдача токенов через signIn |
| `signIn` | `(body: ISignInRequestDto, deviceInfo?: IDeviceInfo) => Promise<ISignInResponseDto>` | Вход: поиск по email/phone, проверка пароля, создание сессии, выдача токенов или 2FA challenge |
| `requestResetPassword` | `(login: string) => Promise<ApiResponseDto>` | Запрос сброса пароля: создание токена, отправка email |
| `resetPassword` | `(token: string, password: string) => Promise<ApiResponseDto>` | Смена пароля по токену сброса, завершение всех сессий |
| `updateTokens` | `(token?: string) => Promise<ITokensDto>` | Обновление JWT-токенов по refresh-токену с проверкой сессии |
| `enable2FA` | `(userId: string, password: string, hint?: string) => Promise<ApiResponseDto>` | Включение 2FA: сохранение хеша пароля и подсказки |
| `disable2FA` | `(userId: string, password: string) => Promise<ApiResponseDto>` | Отключение 2FA: проверка пароля, обнуление полей |
| `verify2FA` | `(twoFactorToken: string, password: string, deviceInfo?: IDeviceInfo) => Promise<IUserWithTokensDto>` | Верификация 2FA: проверка JWT + пароля, создание сессии, выдача токенов |

### Приватные методы контроллера

| Метод | Описание |
|-------|----------|
| `_extractDeviceInfo(req: KoaRequest) => IDeviceInfo` | Извлекает из запроса: `ip`, `user-agent`, `x-device-name`, `x-device-type` |

---

## DTO

### Интерфейсы запросов

| DTO | Поля | Описание |
|-----|------|----------|
| `TSignUpRequestDto` | `password: string`, `firstName?: string`, `lastName?: string`, и (`email: string`, `phone?: string`) или (`email?: string`, `phone: string`) | Данные регистрации; обязателен email или phone |
| `ISignInRequestDto` | `login: string`, `password: string` (extends `IUserLoginRequestDto`) | Данные входа; `login` — email или телефон |
| `IUserLoginRequestDto` | `login: string` | Логин для запроса сброса пароля |
| `IUserResetPasswordRequestDto` | `token: string`, `password: string` (extends `IUserChangePasswordDto`) | Данные для сброса пароля |
| `IAuthenticateRequestDto` | `code: string` | Код аутентификации |
| `IEnable2FARequestDto` | `password: string`, `hint?: string` | Данные для включения 2FA |
| `IDisable2FARequestDto` | `password: string` | Данные для отключения 2FA |
| `IVerify2FARequestDto` | `twoFactorToken: string`, `password: string` | Данные для верификации 2FA |
| `IDeviceInfo` | `ip?: string`, `userAgent?: string`, `deviceName?: string`, `deviceType?: string` | Информация об устройстве, извлекается из заголовков запроса |

### Интерфейсы ответов

| DTO | Поля | Описание |
|-----|------|----------|
| `IUserWithTokensDto` | extends `UserDto` + `tokens: ITokensDto` | Данные пользователя с access/refresh токенами |
| `I2FARequiredDto` | `require2FA: true`, `twoFactorToken: string`, `twoFactorHint?: string` | Ответ при необходимости 2FA |
| `ISignInResponseDto` | `IUserWithTokensDto \| I2FARequiredDto` | Union-тип ответа sign-in |

---

## Валидация (Zod-схемы)

| Схема | Поля и правила |
|-------|----------------|
| `SignUpSchema` | `password`: 6-100 символов; `email`: валидный формат, до 50 символов, trim + lowercase; `phone`: формат `+7XXXXXXXXXX` или `8XXXXXXXXXX`; `firstName`, `lastName`: до 40 символов, опционально. Refine: обязателен email или phone |
| `SignInSchema` | `login`: 1-100 символов; `password`: 6-100 символов |
| `RequestResetPasswordSchema` | `login`: 1-100 символов |
| `ResetPasswordSchema` | `token`: непустая строка; `password`: 6-100 символов |
| `RefreshSchema` | `refreshToken`: непустая строка |
| `AuthenticateSchema` | `code`: непустая строка |
| `Enable2FASchema` | `password`: 4-100 символов; `hint`: до 100 символов, опционально |
| `Disable2FASchema` | `password`: 4-100 символов |
| `Verify2FASchema` | `twoFactorToken`: непустая строка; `password`: 4-100 символов |

---

## События (Events)

Модуль эмитит следующие доменные события через `EventBus`:

| Событие | Поля | Откуда эмитится | Описание |
|---------|------|-----------------|----------|
| `UserLoggedInEvent` | `userId: string`, `sessionId?: string` | `signIn()`, `verify2FA()` | Пользователь успешно вошел в систему (с созданием сессии) |
| `TwoFactorEnabledEvent` | `userId: string` | `enable2FA()` | Пользователь включил двухфакторную аутентификацию |
| `TwoFactorDisabledEvent` | `userId: string` | `disable2FA()` | Пользователь отключил двухфакторную аутентификацию |

Также используется событие из модуля `User`:

| Событие | Откуда эмитится | Описание |
|---------|-----------------|----------|
| `PasswordChangedEvent(userId, "reset")` | `resetPassword()` | Пароль пользователя сброшен через токен |

---

## Socket-интеграция

Модуль реализует `ISocketEventListener` через класс `AuthListener`, зарегистрированный как `asSocketListener(AuthListener)` в `@Module.providers`.

### Подписки на EventBus-события

| Событие | Socket-событие | Получатель | Payload |
|---------|---------------|------------|---------|
| `UserLoggedInEvent` | `session:new` | `toUser(event.userId)` | `{ sessionId: string }` |
| `TwoFactorEnabledEvent` | `auth:2fa-changed` | `toUser(event.userId)` | `{ enabled: true }` |
| `TwoFactorDisabledEvent` | `auth:2fa-changed` | `toUser(event.userId)` | `{ enabled: false }` |

Все socket-уведомления отправляются конкретному пользователю через `SocketEmitterService.toUser()`.

---

## Зависимости модуля

### Объявление модуля (`auth.module.ts`)

```typescript
@Module({
  providers: [AuthController, AuthService, asSocketListener(AuthListener)],
})
export class AuthModule {}
```

Модуль не импортирует другие модули через `@Module.imports`, но `AuthService` и `AuthListener` имеют прямые DI-зависимости от провайдеров других модулей:

| Зависимость | Модуль-источник | Использование |
|-------------|-----------------|---------------|
| `UserService` | `UserModule` | Поиск пользователя по атрибутам, создание, смена пароля, получение полных данных |
| `UserRepository` | `UserModule` | Прямое обновление полей `twoFactorHash` и `twoFactorHint` |
| `MailerService` | `MailerModule` | Отправка email со ссылкой для сброса пароля |
| `ResetPasswordTokensService` | `ResetPasswordTokensModule` | Создание и валидация токенов сброса пароля |
| `TokenService` | `core` (инфраструктура) | Выдача JWT access/refresh токенов (`TokenService.issue()`) |
| `EventBus` | `core` (инфраструктура) | Эмит доменных событий |
| `SessionService` | `SessionModule` | Создание сессий, поиск по refresh-токену, обновление токена, завершение всех сессий пользователя |
| `SocketEmitterService` | `SocketModule` | Отправка socket-уведомлений пользователю (в `AuthListener`) |

Также используются утилиты из `core`:

- `ApiResponseDto` — обертка для ответов
- `getContextUser` — извлечение текущего пользователя из Koa-контекста
- `verifyToken` — верификация JWT-токена
- `ThrottleGuard` — rate limiting на уровне endpoint
- `ValidateBody` — валидация body через Zod-схему
- `ITokensDto` — интерфейс пары токенов
- `logger` — логирование ошибок

---

## Взаимодействие с другими модулями

### Кто зависит от Auth-модуля

- **`AppModule`** — импортирует `AuthModule` в массиве `imports` для регистрации в IoC-контейнере
- **tsoa routing** (`src/routing/routes.ts`) — автогенерированные маршруты регистрируют `AuthController` через IoC
- Модуль экспортирует события (`UserLoggedInEvent`, `TwoFactorEnabledEvent`, `TwoFactorDisabledEvent`) через `index.ts` — другие модули могут подписываться на них через `EventBus`

### Как работает цепочка аутентификации

1. Пользователь вызывает `POST /api/auth/sign-up` или `POST /api/auth/sign-in`
2. `AuthService` находит/создает пользователя через `UserService`
3. Если 2FA включена — возвращает `twoFactorToken` (JWT, 5 мин, `type: "2fa"`)
4. Клиент вызывает `POST /api/auth/verify-2fa` с токеном и 2FA-паролем
5. Создается сессия через `SessionService.createSession()` с информацией об устройстве
6. `TokenService.issue(user, sessionId)` выдает `accessToken` и `refreshToken`
7. Refresh-токен сохраняется в сессии через `SessionService.updateRefreshToken()`
8. Эмитится `UserLoggedInEvent` — `AuthListener` отправляет socket-уведомление `session:new`
9. `accessToken` используется в заголовке `Authorization: Bearer <token>` для доступа к защищенным endpoints
10. По истечении `accessToken` клиент вызывает `POST /api/auth/refresh` — проверяется сессия, выдается новая пара токенов
11. При сбросе пароля все сессии пользователя завершаются через `SessionService.terminateAllByUser()`

---

## Тестирование

Модуль содержит два набора тестов:

- **`auth.service.test.ts`** — unit-тесты `AuthService` (Mocha + Sinon + Chai): signUp, signIn (включая 2FA flow и fallback-поиск), requestResetPassword, resetPassword, updateTokens, enable2FA, disable2FA, verify2FA. Все зависимости замокированы.
- **`validation/auth.validation.test.ts`** — unit-тесты всех Zod-схем валидации: проверка валидных и невалидных данных, граничные случаи (пустые строки, превышение длины, некорректные форматы, трансформации).
