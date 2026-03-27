# Модуль авторизации (Auth)

## Краткое описание

Модуль `Auth` отвечает за аутентификацию и авторизацию пользователей: регистрацию, вход в систему, сброс пароля, обновление JWT-токенов и двухфакторную аутентификацию (2FA). Модуль не имеет собственной entity — работает с entity пользователя (`User`) через `UserService` и `UserRepository`.

---

## Структура файлов

```
src/modules/auth/
├── auth.controller.ts                  # REST-контроллер (tsoa), 7 endpoints
├── auth.dto.ts                         # Интерфейсы DTO (запросы и ответы)
├── auth.module.ts                      # Объявление модуля (@Module)
├── auth.service.ts                     # Бизнес-логика аутентификации
├── auth.service.test.ts                # Unit-тесты AuthService (Mocha + Sinon)
├── index.ts                            # Реэкспорт (controller, module, service)
└── validation/
    ├── auth-authenticate.validate.ts   # Zod-схема AuthenticateSchema
    ├── auth-refresh.validate.ts        # Zod-схема RefreshSchema
    ├── auth-reset-password.validate.ts # Zod-схемы RequestResetPasswordSchema, ResetPasswordSchema
    ├── auth-sign-in.validate.ts        # Zod-схема SignInSchema
    ├── auth-sign-up.validate.ts        # Zod-схема SignUpSchema
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
- `User.twoFactorHint` — текстовая подсказка для 2FA пароля (опционально)
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
| `POST` | `/api/auth/disable-2fa` | Отключение двухфакторной аутентификации | `@Security("jwt")` | Нет | Нет |
| `POST` | `/api/auth/verify-2fa` | Верификация 2FA и получение токенов | Нет | Нет | `Verify2FASchema` |

### Подробности endpoints

#### POST /api/auth/sign-up
- **Вход:** `{ email?, phone?, password, firstName?, lastName? }` — обязателен либо `email`, либо `phone`
- **Выход:** `IUserWithTokensDto` — данные пользователя + `{ accessToken, refreshToken }`
- **Логика:** проверяет уникальность email/phone, создает пользователя, хеширует пароль (bcrypt, 12 раундов), вызывает `signIn` для выдачи токенов
- **Ошибки:** `400` — если email/phone уже зарегистрирован или не указан ни один из них

#### POST /api/auth/sign-in
- **Вход:** `{ login, password }` — `login` может быть email или телефоном
- **Выход:** `IUserWithTokensDto` или `I2FARequiredDto`
- **Логика:** определяет тип логина по наличию `@`, ищет пользователя, сравнивает пароль через bcrypt. Если у пользователя включена 2FA — возвращает `{ require2FA: true, twoFactorToken, twoFactorHint? }` вместо токенов. `twoFactorToken` — JWT со сроком 5 минут и `type: "2fa"`
- **Ошибки:** `401` — неверный логин или пароль

#### POST /api/auth/request-reset-password
- **Вход:** `{ login }` — email или телефон
- **Выход:** `ApiResponseDto` с сообщением
- **Логика:** ищет пользователя, создает токен сброса через `ResetPasswordTokensService`, отправляет email через `MailerService`. При отсутствии пользователя возвращает такой же успешный ответ (для защиты от перебора)
- **Ошибки:** `404` — если у найденного пользователя нет email (скрыто за generic-ответом)

#### POST /api/auth/reset-password
- **Вход:** `{ token, password }`
- **Выход:** `ApiResponseDto` с сообщением об успехе
- **Логика:** валидирует токен через `ResetPasswordTokensService.check()`, меняет пароль через `UserService.changePassword()`

#### POST /api/auth/refresh
- **Вход:** `{ refreshToken }`
- **Выход:** `ITokensDto { accessToken, refreshToken }`
- **Логика:** верифицирует refresh-токен (`verifyToken`), извлекает `userId`, загружает пользователя, выдает новую пару токенов через `TokenService.issue()`
- **Ошибки:** `401` — токен отсутствует, невалидный или просроченный

#### POST /api/auth/enable-2fa
- **Вход:** `{ password, hint? }` — пароль 2FA (отдельный от основного), опциональная подсказка
- **Security:** `@Security("jwt")` — требуется авторизация
- **Выход:** `ApiResponseDto` с сообщением об успехе
- **Логика:** проверяет, что 2FA еще не включена, хеширует пароль 2FA (bcrypt, 12 раундов), сохраняет `twoFactorHash` и `twoFactorHint` в `User`
- **Ошибки:** `400` — если 2FA уже включена

#### POST /api/auth/disable-2fa
- **Вход:** `{ password }` — текущий пароль 2FA для подтверждения
- **Security:** `@Security("jwt")` — требуется авторизация
- **Выход:** `ApiResponseDto` с сообщением об успехе
- **Логика:** проверяет, что 2FA включена, сравнивает пароль через bcrypt, обнуляет `twoFactorHash` и `twoFactorHint`
- **Ошибки:** `400` — 2FA не включена; `401` — неверный пароль 2FA

#### POST /api/auth/verify-2fa
- **Вход:** `{ twoFactorToken, password }` — JWT-токен из ответа `sign-in` + пароль 2FA
- **Выход:** `IUserWithTokensDto` — данные пользователя + токены
- **Логика:** верифицирует JWT (проверяет `type === "2fa"`), загружает пользователя, сравнивает пароль 2FA через bcrypt, выдает токены
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

### Методы

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `signUp` | `(body: TSignUpRequestDto) => Promise<IUserWithTokensDto>` | Регистрация: проверка уникальности, создание пользователя, выдача токенов |
| `signIn` | `(body: ISignInRequestDto) => Promise<ISignInResponseDto>` | Вход: поиск по email/phone, проверка пароля, выдача токенов или 2FA challenge |
| `requestResetPassword` | `(login: string) => Promise<ApiResponseDto>` | Запрос сброса пароля: создание токена, отправка email |
| `resetPassword` | `(token: string, password: string) => Promise<ApiResponseDto>` | Смена пароля по токену сброса |
| `updateTokens` | `(token?: string) => Promise<ITokensDto>` | Обновление JWT-токенов по refresh-токену |
| `enable2FA` | `(userId: string, password: string, hint?: string) => Promise<ApiResponseDto>` | Включение 2FA: сохранение хеша пароля и подсказки |
| `disable2FA` | `(userId: string, password: string) => Promise<ApiResponseDto>` | Отключение 2FA: проверка пароля, обнуление полей |
| `verify2FA` | `(twoFactorToken: string, password: string) => Promise<IUserWithTokensDto>` | Верификация 2FA: проверка JWT + пароля, выдача токенов |

---

## DTO

### Интерфейсы запросов

| DTO | Поля | Описание |
|-----|------|----------|
| `TSignUpRequestDto` | `password: string`, `firstName?: string`, `lastName?: string`, и (`email: string`, `phone?: string`) или (`email?: string`, `phone: string`) | Данные регистрации; обязателен email или phone |
| `ISignInRequestDto` | `login: string`, `password: string` | Данные входа; `login` — email, телефон или username |
| `IUserLoginRequestDto` | `login: string` | Логин для запроса сброса пароля |
| `IUserResetPasswordRequestDto` | `token: string`, `password: string` (extends `IUserChangePasswordDto`) | Данные для сброса пароля |
| `IAuthenticateRequestDto` | `code: string` | Код аутентификации |
| `IEnable2FARequestDto` | `password: string`, `hint?: string` | Данные для включения 2FA |
| `IDisable2FARequestDto` | `password: string` | Данные для отключения 2FA |
| `IVerify2FARequestDto` | `twoFactorToken: string`, `password: string` | Данные для верификации 2FA |

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
| `SignUpSchema` | `password`: 6-100 символов; `email`: валидный формат, до 50 символов, trim + lowercase; `phone`: формат `+7XXXXXXXXXX` или `8XXXXXXXXXX`; `firstName`, `lastName`: до 50 символов, опционально. Refine: обязателен email или phone |
| `SignInSchema` | `login`: 1-100 символов; `password`: 6-100 символов |
| `RequestResetPasswordSchema` | `login`: 1-100 символов |
| `ResetPasswordSchema` | `token`: непустая строка; `password`: 6-100 символов |
| `RefreshSchema` | `refreshToken`: непустая строка |
| `AuthenticateSchema` | `code`: непустая строка |
| `Enable2FASchema` | `password`: 4-100 символов; `hint`: до 100 символов, опционально |
| `Verify2FASchema` | `twoFactorToken`: непустая строка; `password`: 4-100 символов |

---

## События (Events)

Модуль **не эмитит доменных событий** через `EventBus`. Не имеет директории `events/`.

---

## Socket-интеграция

Модуль **не имеет socket-интеграции**. Не реализует `ISocketEventListener`.

---

## Зависимости модуля

### Объявление модуля (`auth.module.ts`)

```typescript
@Module({
  providers: [AuthController, AuthService],
})
export class AuthModule {}
```

Модуль не импортирует другие модули через `@Module.imports`, но `AuthService` имеет прямые DI-зависимости от провайдеров других модулей:

| Зависимость | Модуль-источник | Использование |
|-------------|-----------------|---------------|
| `UserService` | `UserModule` | Поиск пользователя по атрибутам, создание, смена пароля, получение полных данных |
| `UserRepository` | `UserModule` | Прямое обновление полей `twoFactorHash` и `twoFactorHint` |
| `MailerService` | `MailerModule` | Отправка email со ссылкой для сброса пароля |
| `ResetPasswordTokensService` | `ResetPasswordTokensModule` | Создание и валидация токенов сброса пароля |
| `TokenService` | `core` (инфраструктура) | Выдача JWT access/refresh токенов (`TokenService.issue()`) |

Также используются утилиты из `core`:
- `ApiResponseDto` — обертка для ответов
- `getContextUser` — извлечение текущего пользователя из Koa-контекста
- `verifyToken` — верификация JWT-токена
- `ThrottleGuard` — rate limiting на уровне endpoint
- `ValidateBody` — валидация body через Zod-схему
- `ITokensDto` — интерфейс пары токенов

---

## Взаимодействие с другими модулями

### Кто зависит от Auth-модуля

- **`AppModule`** — импортирует `AuthModule` в массиве `imports` для регистрации в IoC-контейнере
- **tsoa routing** (`src/routing/routes.ts`) — автогенерированные маршруты регистрируют `AuthController` через IoC
- **`src/modules/index.ts`** — реэкспортирует `AuthController` для общего доступа

### Как работает цепочка аутентификации

1. Пользователь вызывает `POST /api/auth/sign-in` с логином и паролем
2. `AuthService.signIn()` находит пользователя через `UserService.getUserByAttr()`
3. Если 2FA включена — возвращает `twoFactorToken` (JWT, 5 мин, `type: "2fa"`)
4. Клиент вызывает `POST /api/auth/verify-2fa` с токеном и 2FA-паролем
5. `TokenService.issue()` выдает `accessToken` и `refreshToken`
6. `accessToken` используется в заголовке `Authorization: Bearer <token>` для доступа к защищенным endpoints других модулей (через `@Security("jwt")` и `koa-authentication.ts`)
7. По истечении `accessToken` клиент вызывает `POST /api/auth/refresh` для обновления пары токенов

---

## Тестирование

Модуль содержит два набора тестов:

- **`auth.service.test.ts`** — unit-тесты `AuthService` (Mocha + Sinon): signUp, signIn, requestResetPassword, resetPassword, updateTokens, enable2FA, disable2FA, verify2FA. Моки всех зависимостей.
- **`validation/auth.validation.test.ts`** — unit-тесты всех 7 Zod-схем валидации: проверка валидных и невалидных данных, граничные случаи (пустые строки, превышение длины, некорректные форматы).
