# Модуль ResetPasswordTokens

Модуль управления JWT-токенами для сброса пароля пользователей. Обеспечивает создание, хранение, валидацию и одноразовое использование токенов сброса пароля. Каждый пользователь может иметь не более одного активного токена сброса пароля одновременно (upsert-логика).

## Структура файлов

```
src/modules/reset-password-tokens/
├── index.ts                                  # Реэкспорт публичного API модуля
├── reset-password-tokens.dto.ts              # Интерфейс DTO
├── reset-password-tokens.entity.ts           # TypeORM-сущность
├── reset-password-tokens.module.ts           # Объявление модуля (@Module)
├── reset-password-tokens.repository.ts       # Репозиторий (расширяет BaseRepository)
├── reset-password-tokens.service.ts          # Бизнес-логика создания и проверки токенов
└── reset-password-tokens.service.test.ts     # Unit-тесты сервиса
```

## Entity

**Таблица:** `reset_password_tokens`

| Поле        | Тип       | Описание                                           |
|-------------|-----------|---------------------------------------------------|
| `userId`    | `uuid`    | **Primary Key.** ID пользователя (один токен на пользователя) |
| `token`     | `varchar` | JWT-токен сброса пароля. Уникальный индекс `IDX_RESET_TOKENS_TOKEN` |
| `createdAt` | `Date`    | Дата создания записи (auto)                        |
| `updatedAt` | `Date`    | Дата последнего обновления (auto)                  |

### Связи

| Связь      | Тип        | Целевая сущность | Описание                                         |
|------------|------------|------------------|--------------------------------------------------|
| `user`     | `ManyToOne`| `User`           | Связь с пользователем по `user_id`, `onDelete: CASCADE` |

В сущности `User` есть обратная связь `OneToMany` на `ResetPasswordTokens` через поле `resetPasswordTokens` (с `cascade: true`).

### Статические методы

- `createToken(userId: string, token: string)` -- фабричный метод для создания объекта токена.

### Экземплярные методы

- `toDTO()` -- преобразование сущности в plain-объект с полями `userId`, `token`, `createdAt`, `updatedAt`.

## Endpoints

Модуль **не имеет собственного контроллера**. Все HTTP-эндпоинты, использующие функциональность сброса пароля, находятся в модуле `Auth`:

| Метод  | Путь                        | Описание                                   | Security     |
|--------|-----------------------------|--------------------------------------------|--------------|
| `POST` | `/api/auth/forgot-password` | Запрос на сброс пароля (создание токена)   | Без авторизации |
| `POST` | `/api/auth/reset-password`  | Установка нового пароля по токену          | Без авторизации |

## Сервис (`ResetPasswordTokensService`)

### `create(userId: string): Promise<ResetPasswordTokens>`

Создает или обновляет JWT-токен сброса пароля для пользователя.

**Логика:**
1. Генерирует JWT-токен с payload `{ userId, roles: [], permissions: [], emailVerified: false }` и временем жизни из конфигурации `config.auth.resetPassword.expireMinutes` (по умолчанию 60 минут).
2. Ищет существующий токен по `userId`.
3. Если найден -- обновляет значение токена (upsert).
4. Если не найден -- создает новую запись.

### `check(token: string): Promise<{ userId: string, token: string }>`

Проверяет токен сброса пароля и удаляет его после успешной валидации (одноразовое использование).

**Логика:**
1. Верифицирует JWT-подпись токена через `verifyToken()`. При невалидном JWT выбрасывает `JsonWebTokenError`.
2. Ищет токен в базе данных. Если не найден -- выбрасывает `BadRequestException` с сообщением "Неверный токен. Пожалуйста, повторите попытку."
3. Удаляет запись токена из базы данных.
4. Возвращает `{ userId, token }`.

## DTO

### `IResetPasswordTokensDto`

```typescript
interface IResetPasswordTokensDto {
  userId: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Интерфейс описывает структуру данных токена сброса пароля для передачи клиенту.

## Репозиторий (`ResetPasswordTokensRepository`)

Расширяет `BaseRepository<ResetPasswordTokens>`, зарегистрирован через `@InjectableRepository(ResetPasswordTokens)`.

### Методы

| Метод                            | Описание                                                        |
|----------------------------------|-----------------------------------------------------------------|
| `findByUserId(userId: string)`   | Поиск токена по ID пользователя                                 |
| `findByToken(token: string)`     | Поиск токена по значению, с подгрузкой связанного `user`        |

Также наследует все методы `BaseRepository`: `save`, `createAndSave`, `delete`, `findOne` и т.д.

## События (Events)

Модуль **не генерирует собственных доменных событий** через `EventBus`.

## Socket-интеграция

Модуль **не имеет socket-интеграции**.

## Конфигурация

Модуль использует параметры из `config.auth.resetPassword`:

| Параметр         | Тип     | По умолчанию                                            | Описание                              |
|------------------|---------|---------------------------------------------------------|---------------------------------------|
| `expireMinutes`  | `number`| `60`                                                    | Время жизни токена в минутах          |
| `webUrl`         | `string`| `http://localhost:3000/reset-password?token={{token}}`  | URL страницы сброса пароля (используется в AuthService при отправке email) |

## Зависимости

### Импортируемые модули

Модуль не импортирует другие модули через `@Module.imports`. Зарегистрирован в `AppModule` как самостоятельный модуль.

### Внутренние зависимости

- `BaseRepository`, `InjectableRepository` -- из `src/core` (базовый репозиторий)
- `createToken`, `verifyToken` -- из `src/core` (JWT-утилиты)
- `Injectable` -- из `src/core` (маркер для DI)
- `config` -- из `src/config` (конфигурация приложения)
- `BadRequestException` -- из `@force-dev/utils` (HTTP-исключения)

### Зависимости от других Entity

- `User` (`src/modules/user/user.entity`) -- связь `ManyToOne`, каскадное удаление

## Взаимодействие с другими модулями

### AuthModule (основной потребитель)

`AuthService` инжектирует `ResetPasswordTokensService` и использует его в двух сценариях:

1. **Запрос сброса пароля (`forgotPassword`):**
   - Вызывает `ResetPasswordTokensService.create(user.id)` для генерации токена.
   - Отправляет email со ссылкой на сброс пароля через `MailerService.sendResetPasswordMail()`.

2. **Сброс пароля (`resetPassword`):**
   - Вызывает `ResetPasswordTokensService.check(token)` для валидации и одноразового использования токена.
   - После успешной проверки вызывает `UserService.changePassword(userId, password)`.

### UserModule

- Сущность `User` содержит обратную связь `OneToMany` на `ResetPasswordTokens` с `cascade: true`, что обеспечивает автоматическое удаление токенов при удалении пользователя.

## Тесты

Файл `reset-password-tokens.service.test.ts` содержит unit-тесты для `ResetPasswordTokensService`:

- **create:** проверка создания нового токена и обновления (upsert) существующего
- **check:** проверка успешной валидации и удаления токена, обработка невалидного JWT (`JsonWebTokenError`), обработка отсутствующего в БД токена (`BadRequestException`)
