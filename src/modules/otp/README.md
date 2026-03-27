# Модуль OTP (One-Time Password)

Сервисный модуль одноразовых паролей. Генерирует, хранит и проверяет 6-значные числовые коды для верификации email. Не имеет собственного контроллера — функциональность доступна через `OtpService`.

## Структура файлов

```
src/modules/otp/
├── otp.module.ts          # Объявление модуля (@Module)
├── otp.entity.ts          # Entity OTP (таблица otp)
├── otp.repository.ts      # Репозиторий
├── otp.service.ts         # Сервис генерации и проверки OTP
├── otp.dto.ts             # DTO интерфейсы
├── otp.service.test.ts    # Тесты
└── index.ts               # Публичный API модуля
```

## Entity

### Otp (таблица `otp`)

| Поле | Тип | Описание |
|------|-----|----------|
| `userId` | `uuid` (PK) | ID пользователя (один OTP на пользователя) |
| `code` | `varchar(6)` | 6-значный код |
| `expireAt` | `timestamp` | Время истечения |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Связи:** `OneToOne` -> `User` (`onDelete: CASCADE`)

**Методы:**
- `isExpired()` — проверка истечения
- `toDTO()` — преобразование в DTO
- `static createOtp(userId, code, expireMinutes)` — фабричный метод

## Сервисы

### OtpService

| Метод | Описание |
|-------|----------|
| `create(userId)` | Создать или обновить OTP. Генерирует 6-значный код, TTL из `config.auth.otp.expireMinutes`. |
| `check(userId, code)` | Проверить OTP. При успехе удаляет запись. Бросает `BadRequestException` (неверный код) или `GoneException` (истёк). |

## DTO

- **IOtpDto** — userId, code, expireAt, createdAt, updatedAt
- **IOtpListDto** — пагинированный список

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `generateOtp()` | `common` | Генерация 6-значного кода |
| `config.auth.otp.expireMinutes` | `config` | TTL кода |
| `moment` | npm | Вычисление времени истечения |

## Взаимодействие

Используется модулем **User/Auth** для верификации email: `OtpService.create()` -> отправка кода через `MailerService` -> `OtpService.check()`.
