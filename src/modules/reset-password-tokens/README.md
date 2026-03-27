# Модуль ResetPasswordTokens

Сервисный модуль управления JWT-токенами для сброса пароля. Обеспечивает создание, хранение и одноразовую проверку токенов. Каждый пользователь может иметь один активный токен (upsert-логика). Не имеет собственного контроллера.

## Структура файлов

```
src/modules/reset-password-tokens/
├── reset-password-tokens.module.ts        # Объявление модуля (@Module)
├── reset-password-tokens.entity.ts        # Entity токена (таблица reset_password_tokens)
├── reset-password-tokens.repository.ts    # Репозиторий
├── reset-password-tokens.service.ts       # Сервис создания и проверки токенов
├── reset-password-tokens.dto.ts           # DTO интерфейсы
├── reset-password-tokens.service.test.ts  # Тесты
└── index.ts                               # Публичный API модуля
```

## Entity

### ResetPasswordTokens (таблица `reset_password_tokens`)

| Поле | Тип | Описание |
|------|-----|----------|
| `userId` | `uuid` (PK) | ID пользователя (один токен на пользователя) |
| `token` | `varchar` | JWT-токен сброса пароля |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Индексы:** `IDX_RESET_TOKENS_TOKEN` — уникальный по token

**Связи:** `OneToOne` -> `User` (`onDelete: CASCADE`)

## Сервисы

### ResetPasswordTokensService

| Метод | Описание |
|-------|----------|
| `create(userId)` | Создать/обновить JWT-токен сброса пароля. TTL из `config.auth.resetPassword.expireMinutes`. |
| `check(token)` | Верифицировать JWT, проверить наличие в БД, удалить после успешной проверки. Возвращает `{ userId, token }`. |

## DTO

- **IResetPasswordTokensDto** — userId, token, createdAt, updatedAt

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `createToken`, `verifyToken` | `core` | Генерация и верификация JWT |
| `config.auth.resetPassword.expireMinutes` | `config` | TTL токена |

## Взаимодействие

Используется модулем **Auth/User**: `ResetPasswordTokensService.create()` -> отправка ссылки через `MailerService.sendResetPasswordMail()` -> `ResetPasswordTokensService.check()` -> смена пароля.
