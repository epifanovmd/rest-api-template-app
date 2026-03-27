# OTP (One-Time Password) Module

## Краткое описание

Модуль одноразовых паролей (OTP) отвечает за генерацию, хранение и проверку 6-значных числовых кодов. Используется для верификации email пользователя. Модуль является сервисным -- у него нет собственного контроллера и публичных HTTP-эндпоинтов. Вся работа с OTP происходит через `OtpService`, который вызывается из других модулей (в первую очередь из `UserService`).

---

## Структура файлов

```
src/modules/otp/
├── index.ts                # Реэкспорт публичного API модуля
├── otp.module.ts           # Объявление модуля (@Module)
├── otp.entity.ts           # TypeORM-сущность Otp
├── otp.repository.ts       # Репозиторий OtpRepository
├── otp.service.ts          # Бизнес-логика генерации и проверки OTP
├── otp.dto.ts              # DTO-интерфейсы
└── otp.service.test.ts     # Unit-тесты сервиса
```

---

## Entity -- `Otp`

Таблица: `otp`

### Поля

| Поле         | Тип             | Колонка       | Описание                                   |
|-------------|-----------------|---------------|---------------------------------------------|
| `userId`    | `string` (uuid) | `user_id` (PK)| Идентификатор пользователя (первичный ключ) |
| `code`      | `varchar(6)`    | `code`        | 6-значный числовой OTP-код                  |
| `expireAt`  | `timestamp`     | `expire_at`   | Время истечения срока действия кода          |
| `createdAt` | `timestamp`     | `created_at`  | Дата создания записи (auto)                 |
| `updatedAt` | `timestamp`     | `updated_at`  | Дата последнего обновления (auto)            |

**Примечание:** Первичный ключ -- `user_id`, что означает, что у одного пользователя может быть не более одной активной OTP-записи одновременно.

### Связи

| Связь  | Тип         | Связанная сущность | FK         | Поведение при удалении |
|--------|-------------|---------------------|------------|------------------------|
| `user` | `ManyToOne` | `User`              | `user_id`  | `CASCADE`              |

Обратная связь в `User`: `@OneToMany(() => Otp, otp => otp.user, { cascade: true })` -- поле `user.otps`.

### Методы entity

- **`isExpired(): boolean`** -- проверяет, истек ли срок действия кода (сравнивает `expireAt` с текущим временем).
- **`toDTO()`** -- преобразует сущность в plain-объект для передачи клиенту.
- **`static createOtp(userId, code, expireMinutes): Partial<Otp>`** -- фабричный метод для создания объекта OTP с вычисленным временем истечения.

---

## Endpoints

Модуль **не имеет собственного контроллера**. OTP-функциональность доступна через эндпоинты модуля `User`:

| Метод | Путь                                | Описание                             | Security |
|-------|-------------------------------------|--------------------------------------|----------|
| POST  | `/users/request-verify-email`       | Генерирует OTP и отправляет на email | JWT      |
| POST  | `/users/verify-email`               | Проверяет OTP-код и подтверждает email | JWT    |

---

## Сервис -- `OtpService`

### Зависимости

- `OtpRepository` -- инжектируется через `@inject(OtpRepository)`

### Конфигурация

Используется параметр `config.auth.otp.expireMinutes` (по умолчанию 10 минут), задается через переменную окружения `OTP_EXPIRE_MINUTES`.

### Методы

#### `create(userId: string): Promise<Otp>`

Создает или обновляет OTP-код для пользователя.

- Генерирует случайный 6-значный числовой код через `generateOtp()` (из `src/common/helpers/generate.ts`, использует `crypto.randomInt`).
- Ищет существующую OTP-запись по `userId`.
- Если запись найдена -- обновляет `code` и `expireAt`, сохраняет.
- Если не найдена -- создает новую запись с `userId`, `code` и вычисленным `expireAt`.
- Возвращает сохраненную сущность `Otp`.

#### `check(userId: string, code: string): Promise<true>`

Проверяет OTP-код пользователя.

- Ищет запись по `userId` и `code`.
- Если запись не найдена -- выбрасывает `BadRequestException` ("Неверный код").
- Е��ли код найден, но срок действия истек -- удаляет запись и выбрасывает `GoneException` ("Срок действия кода истек").
- Если код валиден и не истек -- удаляет запись и возвращает `true`.

**Важно:** OTP-запись всегда удаляется после успешной проверки или при истечении срока (одноразовый характер кода).

---

## Repository -- `OtpRepository`

Наследует `BaseRepository<Otp>`. Декорирован `@InjectableRepository(Otp)` -- автоматически регистрируется в IoC через `toDynamicValue`.

### Методы

- **`findByUserId(userId: string): Promise<Otp | null>`** -- поиск OTP по идентификатору пользователя.
- **`findByUserIdAndCode(userId: string, code: string): Promise<Otp | null>`** -- поиск OTP по идентификатору пользователя и коду.

---

## DTO

### `IOtpDto`

```typescript
interface IOtpDto {
  userId: string;
  code: string;
  expireAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### `IOtpListDto`

```typescript
interface IOtpListDto extends IListResponseDto<IOtpDto[]> {}
```

Расширяет `IListResponseDto` -- стандартный интерфейс списочного ответа с пагинацией.

---

## События (Events)

Модуль **не генерирует собственных доменных событий** через `EventBus`.

---

## Socket-интеграция

Модуль **не имеет socket-интеграции**.

---

## Зависимости

### Внутренние зависимости модуля

| Зависимость                   | Источник                           |
|-------------------------------|-------------------------------------|
| `BaseRepository`              | `src/core`                         |
| `InjectableRepository`        | `src/core`                         |
| `Injectable`                  | `src/core`                         |
| `Module`                      | `src/core`                         |
| `IListResponseDto`            | `src/core`                         |
| `generateOtp()`               | `src/common/helpers/generate.ts`   |
| `config.auth.otp`             | `src/config.ts`                    |

### Внешние пакеты

| Пакет               | Назначение                                       |
|---------------------|--------------------------------------------------|
| `typeorm`           | ORM: entity, декораторы, колонки                 |
| `inversify`         | IoC: `@inject`                                   |
| `moment`            | Вычисление времени истечения (`expireAt`)         |
| `@force-dev/utils`  | Исключения: `BadRequestException`, `GoneException`|

---

## Взаимодействие с другими модулями

### User Module (основной потребитель)

`UserService` инжектирует `OtpService` и использует его в двух сценариях:

1. **Запрос верификации email** (`requestVerifyEmail`) -- вызывает `OtpService.create(userId)` для генерации OTP-кода. Затем отправляет код на email пользователя через `MailerService`.

2. **Подтверждение email** (`verifyEmail`) -- вызывает `OtpService.check(userId, code)` для проверки введенного кода. При успешной проверке устанавливает `user.emailVerified = true`.

### Связь через Entity

Сущность `Otp` связана с `User` через `ManyToOne` по `user_id`. При удалении пользователя все его OTP-записи удаляются каскадно (`onDelete: CASCADE`).

---

## Тесты

Файл: `otp.service.test.ts`

Покрывает следующие сценарии:

- **create**: генерация нового OTP, если записи нет; обновление существующего OTP.
- **check**: успешная проверка валидного кода; ошибка `BadRequestException` при неверном коде; ошибка `GoneException` при истекшем коде.
