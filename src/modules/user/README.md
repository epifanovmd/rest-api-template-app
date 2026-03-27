# Модуль User

Модуль управления пользователями системы. Обеспечивает полный CRUD пользователей, управление привилегиями (роли и разрешения), верификацию email через OTP, смену пароля, установку username и поиск пользователей. Включает автоматическое создание администратора при старте приложения.

---

## Структура файлов

```
src/modules/user/
├── admin.bootstrap.ts                    # Bootstrap: создание admin-пользователя при старте
├── user.entity.ts                        # TypeORM-сущность User
├── user.repository.ts                    # Репозиторий с методами поиска пользователей
├── user.service.ts                       # Бизнес-логика: CRUD, привилегии, верификация
├── user.controller.ts                    # REST-контроллер (tsoa), 15 эндпоинтов
├── user.module.ts                        # Объявление модуля (@Module)
├── user.service.test.ts                  # Юнит-тесты сервиса (Mocha + Sinon)
├── index.ts                              # Реэкспорт публичного API модуля
├── dto/
│   ├── user.dto.ts                       # UserDto, PublicUserDto, IUserListDto, IUserOptionDto
│   ├── user-change-password.dto.ts       # IUserChangePasswordDto
│   ├── user-privileges-request.dto.ts    # IUserPrivilegesRequestDto
│   ├── user-update-request.dto.ts        # IUserUpdateRequestDto
│   ├── user.dto.test.ts                  # Юнит-тесты DTO
│   └── index.ts                          # Реэкспорт DTO
└── validation/
    ├── set-username.validate.ts          # Zod-схема SetUsernameSchema
    ├── user-change-password.validate.ts  # Zod-схема ChangePasswordSchema
    ├── user-privileges.validate.ts       # Zod-схема SetPrivilegesSchema
    ├── user-update.validate.ts           # Zod-схема UserUpdateSchema
    ├── user.validation.test.ts           # Юнит-тесты валидационных схем
    └── index.ts                          # Реэкспорт валидаций
```

---

## Entity: User

Таблица: `users`

### Поля

| Поле                | Тип        | Ограничения                                           | Описание                                              |
|---------------------|------------|-------------------------------------------------------|-------------------------------------------------------|
| `id`                | `uuid`     | PK, auto-generated                                    | Уникальный идентификатор                              |
| `email`             | `varchar(50)` | nullable, unique                                   | Email пользователя                                    |
| `emailVerified`     | `boolean`  | default: `false`                                      | Флаг подтверждения email через OTP                    |
| `phone`             | `varchar(14)` | nullable                                           | Номер телефона                                        |
| `username`          | `varchar(32)` | nullable, unique (partial: где не NULL)            | Уникальное имя пользователя (a-z, 0-9, _, 5-32 символа) |
| `passwordHash`      | `varchar(100)` |                                                   | Bcrypt-хеш пароля                                     |
| `challenge`         | `varchar`  | nullable                                              | Временный WebAuthn challenge для passkey              |
| `challengeExpiresAt`| `timestamp`| nullable                                              | Время истечения challenge (TTL 5 мин)                 |
| `twoFactorHash`     | `varchar(100)` | nullable                                          | Хеш секрета двухфакторной аутентификации              |
| `twoFactorHint`     | `varchar(100)` | nullable                                          | Подсказка для 2FA                                     |
| `createdAt`         | `timestamp`| auto                                                  | Дата создания                                         |
| `updatedAt`         | `timestamp`| auto                                                  | Дата последнего обновления                            |

### Индексы

- `IDX_USERS_EMAIL_PHONE` -- уникальный составной индекс по (`email`, `phone`)
- `IDX_USERS_USERNAME` -- уникальный частичный индекс по `username` (WHERE username IS NOT NULL)

### Связи с другими Entity

| Связь              | Тип           | Целевая сущность         | Таблица связи       | Описание                                          |
|--------------------|---------------|--------------------------|----------------------|---------------------------------------------------|
| `roles`            | `ManyToMany`  | `Role`                   | `user_roles`         | Роли пользователя (eager loading)                 |
| `directPermissions`| `ManyToMany`  | `Permission`             | `user_permissions`   | Прямые разрешения, минуя роли (eager loading)     |
| `profile`          | `OneToOne`    | `Profile`                | --                   | Профиль пользователя (cascade, eager)             |
| `biometrics`       | `OneToMany`   | `Biometric`              | --                   | Биометрические данные (cascade)                   |
| `otps`             | `OneToMany`   | `Otp`                    | --                   | OTP-коды пользователя (cascade)                   |
| `resetPasswordTokens` | `OneToMany` | `ResetPasswordTokens`  | --                   | Токены сброса пароля (cascade)                    |
| `passkeys`         | `OneToMany`   | `Passkey`                | --                   | WebAuthn passkeys (cascade)                       |

---

## Endpoints (UserController)

Базовый путь: `/api/user`
Тег Swagger: `User`

### Эндпоинты текущего пользователя (self)

| Метод    | Путь                       | Security                        | Описание                                                |
|----------|----------------------------|---------------------------------|---------------------------------------------------------|
| `GET`    | `/api/user/my`             | `@Security("jwt")`              | Получение данных текущего пользователя                  |
| `PATCH`  | `/api/user/my/update`      | `@Security("jwt")`              | Обновление данных текущего пользователя (email, phone)  |
| `DELETE` | `/api/user/my/delete`      | `@Security("jwt")`              | Удаление текущего пользователя                          |
| `PATCH`  | `/api/user/my/username`    | `@Security("jwt")`              | Установка username для текущего пользователя            |
| `POST`   | `/api/user/requestVerifyEmail` | `@Security("jwt")`          | Запрос подтверждения email (отправка OTP на почту)      |
| `GET`    | `/api/user/verifyEmail/{code}` | `@Security("jwt")`          | Подтверждение email по OTP-коду                         |
| `POST`   | `/api/user/changePassword` | `@Security("jwt")`              | Изменение пароля текущего пользователя                  |

### Эндпоинты поиска и просмотра

| Метод    | Путь                              | Security                                    | Описание                                                     |
|----------|-----------------------------------|---------------------------------------------|--------------------------------------------------------------|
| `GET`    | `/api/user/search`                | `@Security("jwt")`                          | Поиск пользователей (по username, email, имени, фамилии)     |
| `GET`    | `/api/user/by-username/{username}`| `@Security("jwt")`                          | Получение пользователя по username                           |
| `GET`    | `/api/user/all`                   | `@Security("jwt", ["permission:user:view"])` | Получение всех пользователей (пагинация, фильтр по email)   |
| `GET`    | `/api/user/options`               | `@Security("jwt", ["permission:user:view"])` | Опции пользователей для выпадающих списков (id + name)       |
| `GET`    | `/api/user/{id}`                  | `@Security("jwt", ["permission:user:view"])` | Получение пользователя по ID                                 |

### Эндпоинты администрирования

| Метод    | Путь                           | Security                                      | Описание                                               |
|----------|--------------------------------|-----------------------------------------------|--------------------------------------------------------|
| `PATCH`  | `/api/user/setPrivileges/{id}` | `@Security("jwt", ["permission:user:manage"])` | Установка ролей и разрешений пользователю              |
| `PATCH`  | `/api/user/update/{id}`        | `@Security("jwt", ["permission:user:manage"])` | Обновление данных другого пользователя                 |
| `DELETE` | `/api/user/delete/{id}`        | `@Security("jwt", ["permission:user:manage"])` | Удаление другого пользователя                          |

### Используемые разрешения

- `permission:user:view` -- просмотр списка всех пользователей, получение по ID, опции
- `permission:user:manage` -- управление привилегиями, обновление и удаление других пользователей

---

## Сервисы

### UserService

Основной сервис бизнес-логики модуля. Внедряется через IoC (`@Injectable()`).

#### Методы

| Метод                  | Описание                                                                                     |
|------------------------|----------------------------------------------------------------------------------------------|
| `getUsers(offset?, limit?, query?)` | Пагинированный список пользователей с опциональной фильтрацией по email (ILIKE)    |
| `getOptions(query?)`   | Список пользователей для выпадающих списков (id + отображаемое имя)                          |
| `getUserByAttr(where)`  | Поиск пользователя по email или телефону. Выбрасывает `NotFoundException`                   |
| `getUser(id)`           | Получение пользователя по ID со всеми связями. Выбрасывает `NotFoundException`              |
| `createUser(body)`      | Создание пользователя: сохранение, создание профиля (status: Offline), назначение роли USER |
| `createAdmin(body)`     | Создание пользователя с ролью ADMIN. Выбрасывает `ConflictException` если уже существует    |
| `updateUser(id, body)`  | Обновление данных пользователя (email, phone, roleId)                                       |
| `setChallenge(id, challenge)` | Установка/сброс WebAuthn challenge (TTL 5 минут)                                      |
| `setPrivileges(userId, body)` | Полная замена ролей и прямых разрешений пользователя. Создает роли/разрешения если не существуют |
| `requestVerifyEmail(userId)` | Отправка OTP-кода на email пользователя для верификации                                |
| `verifyEmail(userId, code)` | Подтверждение email по OTP-коду                                                          |
| `changePassword(userId, password)` | Смена пароля (bcrypt, 12 раундов)                                                  |
| `deleteUser(userId)`    | Удаление пользователя по ID                                                                 |
| `setUsername(userId, username)` | Установка username (валидация: `^[a-z0-9_]{5,32}$`, проверка уникальности)          |
| `searchUsers(query, limit?, offset?)` | Полнотекстовый поиск по username, email, firstName, lastName (ILIKE)          |
| `getUserByUsername(username)` | Получение пользователя по username. Выбрасывает `NotFoundException`                    |

#### Загружаемые связи (static relations)

При запросах пользователя всегда загружаются: `profile`, `roles` (с вложенными `permissions`), `directPermissions`.

---

## DTO

### UserDto (полная информация)

Возвращается для текущего пользователя и при административных операциях.

| Поле                | Тип               | Описание                              |
|---------------------|--------------------|---------------------------------------|
| `id`                | `string`           | UUID пользователя                     |
| `email`             | `string?`          | Email                                 |
| `emailVerified`     | `boolean?`         | Подтвержден ли email                  |
| `phone`             | `string?`          | Телефон                               |
| `username`          | `string \| null`   | Username                              |
| `profile`           | `ProfileDto?`      | Профиль пользователя                  |
| `roles`             | `IRoleDto[]`       | Список ролей                          |
| `directPermissions` | `IPermissionDto[]` | Прямые разрешения                     |
| `createdAt`         | `Date`             | Дата создания                         |
| `updatedAt`         | `Date`             | Дата обновления                       |

### PublicUserDto (публичная информация)

Возвращается в списках, результатах поиска и для публичного просмотра.

| Поле       | Тип              | Описание                              |
|------------|-------------------|---------------------------------------|
| `userId`   | `string`          | UUID пользователя                     |
| `email`    | `string`          | Email                                 |
| `username` | `string \| null`  | Username                              |
| `profile`  | `PublicProfileDto` | Публичный профиль                    |

### IUserListDto

Пагинированный список пользователей: `{ offset, limit, count, totalCount, data: PublicUserDto[] }`.

### IUserOptionDto

Для выпадающих списков: `{ id: string, name: string }`. Поле `name` содержит имя + фамилию или email, если профиль не заполнен.

### IUserUpdateRequestDto (входящий)

| Поле     | Тип       | Описание             |
|----------|-----------|----------------------|
| `email`  | `string?` | Новый email          |
| `phone`  | `string?` | Новый телефон        |
| `roleId` | `string?` | UUID роли            |

### IUserPrivilegesRequestDto (входящий)

| Поле          | Тип             | Описание                                              |
|---------------|-----------------|-------------------------------------------------------|
| `roles`       | `ERole[]`       | Список ролей (полностью заменяет текущие)             |
| `permissions` | `EPermissions[]`| Список прямых разрешений (полностью заменяет текущие) |

### IUserChangePasswordDto (входящий)

| Поле       | Тип      | Описание    |
|------------|----------|-------------|
| `password` | `string` | Новый пароль |

---

## Валидация (Zod-схемы)

### SetUsernameSchema

- `username` -- строка, regex `^[a-z0-9_]{5,32}$`, трансформация в lowercase.

### ChangePasswordSchema

- `password` -- строка, min 6, max 100 символов.

### UserUpdateSchema

- `email` -- опционально, формат email, max 50 символов, trim + lowercase.
- `phone` -- опционально, формат `+7XXXXXXXXXX` или `8XXXXXXXXXX`, автоматическая нормализация в `+7...`.
- `roleId` -- опционально, валидный UUID.
- Refine: хотя бы одно поле должно быть заполнено.

### SetPrivilegesSchema

- `roles` -- массив значений из `ERole`, минимум 1 элемент.
- `permissions` -- массив значений из `EPermissions`, по умолчанию `[]`.

---

## Bootstrapper: AdminBootstrap

Выполняется при старте приложения (`IBootstrap.initialize()`). Выполняет:

1. Создание администратора с email и паролем из конфигурации (`config.auth.admin.email`, `config.auth.admin.password`). Если пользователь уже существует, ошибка тихо подавляется (`.catch(() => null)`).
2. Засевание дефолтных разрешений через `RoleService.seedDefaultPermissions()`.

---

## События (Events)

Модуль User не эмитирует собственных доменных событий через EventBus.

---

## Socket-интеграция

Модуль User не содержит собственных socket-событий и listener-ов.

---

## Зависимости

### Внедряемые сервисы и репозитории

| Зависимость            | Модуль       | Описание                                      |
|------------------------|--------------|-----------------------------------------------|
| `MailerService`        | Mailer       | Отправка OTP-кода на email                    |
| `OtpService`           | OTP          | Создание и проверка OTP-кодов                 |
| `UserRepository`       | User (self)  | Доступ к таблице users                        |
| `RoleRepository`       | Role         | Поиск и создание ролей                        |
| `PermissionRepository` | Permission   | Поиск и создание разрешений                   |
| `ProfileRepository`    | Profile      | Создание профиля при регистрации              |
| `RoleService`          | Role         | Засевание дефолтных разрешений (в bootstrap)  |

### Регистрация в модуле (providers)

Модуль `UserModule` регистрирует в IoC: `UserRepository`, `RoleRepository`, `RoleService`, `RoleController`, `PermissionRepository`, `UserController`, `UserService`.

Bootstrappers: `AdminBootstrap`.

---

## Взаимодействие с другими модулями

| Модуль         | Направление    | Описание                                                                     |
|----------------|----------------|------------------------------------------------------------------------------|
| **Role**       | User -> Role   | Получение и создание ролей при назначении привилегий; засевание разрешений   |
| **Permission** | User -> Permission | Получение и создание разрешений при назначении привилегий               |
| **Profile**    | User -> Profile | Создание профиля при регистрации; загрузка профиля вместе с пользователем   |
| **OTP**        | User -> OTP    | Генерация и проверка OTP-кодов для верификации email                         |
| **Mailer**     | User -> Mailer | Отправка писем с OTP-кодом для верификации email                             |
| **Auth**       | Auth -> User   | Модуль аутентификации использует UserService для поиска и создания пользователей |
| **Biometric**  | Biometric -> User | Связь OneToMany: биометрические данные привязаны к пользователю          |
| **Passkey**    | Passkey -> User | Связь OneToMany: WebAuthn passkeys привязаны к пользователю; используется setChallenge() |
| **ResetPasswordTokens** | ResetPassword -> User | Связь OneToMany: токены сброса пароля привязаны к пользователю |

---

## Тесты

- `user.service.test.ts` -- юнит-тесты UserService (Mocha + Sinon): покрытие всех основных методов (getUsers, getUser, createUser, createAdmin, updateUser, setChallenge, setPrivileges, requestVerifyEmail, verifyEmail, changePassword, deleteUser, setUsername, searchUsers, getUserByUsername).
- `dto/user.dto.test.ts` -- тесты маппинга UserDto и PublicUserDto из entity.
- `validation/user.validation.test.ts` -- тесты всех Zod-схем валидации (SetUsernameSchema, ChangePasswordSchema, UserUpdateSchema, SetPrivilegesSchema).
