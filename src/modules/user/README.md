# Модуль User

Модуль управления пользователями системы. Обеспечивает полный CRUD пользователей, управление привилегиями (роли и разрешения), верификацию email через OTP, смену пароля, установку username и поиск пользователей. Включает автоматическое создание администратора при старте приложения, 5 доменных событий и socket-listener для real-time уведомлений.

---

## Структура файлов

```
src/modules/user/
├── admin.bootstrap.ts                    # Bootstrap: создание admin-пользователя при старте
├── user.entity.ts                        # TypeORM-сущность User
├── user.repository.ts                    # Репозиторий с методами поиска пользователей
├── user.service.ts                       # Бизнес-логика: CRUD, привилегии, верификация
├── user.controller.ts                    # REST-контроллер (tsoa), 15 эндпоинтов
├── user.listener.ts                      # Socket-listener: подписка на доменные события, отправка через WebSocket
├── user.module.ts                        # Объявление модуля (@Module)
├── user.service.test.ts                  # Юнит-тесты сервиса (Mocha + Sinon)
├── index.ts                              # Реэкспорт публичного API модуля
├── dto/
│   ├── user.dto.ts                       # UserDto, PublicUserDto, IUserListDto, IUserOptionDto, IUserOptionsDto
│   ├── user-change-password.dto.ts       # IUserChangePasswordDto
│   ├── user-privileges-request.dto.ts    # IUserPrivilegesRequestDto
│   ├── user-update-request.dto.ts        # IUserUpdateRequestDto
│   ├── user.dto.test.ts                  # Юнит-тесты DTO
│   └── index.ts                          # Реэкспорт DTO
├── events/
│   ├── email-verified.event.ts           # EmailVerifiedEvent
│   ├── password-changed.event.ts         # PasswordChangedEvent
│   ├── user-deleted.event.ts             # UserDeletedEvent
│   ├── user-privileges-changed.event.ts  # UserPrivilegesChangedEvent
│   ├── username-changed.event.ts         # UsernameChangedEvent
│   └── index.ts                          # Реэкспорт событий
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

| Поле                | Тип            | Ограничения                                    | Описание                                              |
|---------------------|----------------|------------------------------------------------|-------------------------------------------------------|
| `id`                | `uuid`         | PK, auto-generated                             | Уникальный идентификатор                              |
| `email`             | `varchar(50)`  | nullable, unique                               | Email пользователя                                    |
| `emailVerified`     | `boolean`      | default: `false`                               | Флаг подтверждения email через OTP                    |
| `phone`             | `varchar(14)`  | nullable                                       | Номер телефона                                        |
| `username`          | `varchar(32)`  | nullable, unique (partial: где не NULL)         | Уникальное имя пользователя (a-z, 0-9, _, 5-32 символа) |
| `passwordHash`      | `varchar(100)` |                                                | Bcrypt-хеш пароля                                     |
| `challenge`         | `varchar`      | nullable                                       | Временный WebAuthn challenge для passkey              |
| `challengeExpiresAt`| `timestamp`    | nullable                                       | Время истечения challenge (TTL 5 мин)                 |
| `twoFactorHash`     | `varchar(100)` | nullable                                       | Хеш секрета двухфакторной аутентификации              |
| `twoFactorHint`     | `varchar(100)` | nullable                                       | Подсказка для 2FA                                     |
| `createdAt`         | `timestamp`    | auto (CreateDateColumn)                        | Дата создания                                         |
| `updatedAt`         | `timestamp`    | auto (UpdateDateColumn)                        | Дата последнего обновления                            |

### Индексы

- `IDX_USERS_EMAIL_PHONE` -- уникальный составной индекс по (`email`, `phone`)
- `IDX_USERS_PHONE` -- уникальный индекс по `phone`
- `IDX_USERS_USERNAME` -- уникальный частичный индекс по `username` (WHERE username IS NOT NULL)

### Связи с другими Entity

| Связь                  | Тип           | Целевая сущность       | Таблица связи     | Особенности                               |
|------------------------|---------------|------------------------|--------------------|-------------------------------------------|
| `roles`                | `ManyToMany`  | `Role`                 | `user_roles`       | eager loading, JoinTable                  |
| `directPermissions`    | `ManyToMany`  | `Permission`           | `user_permissions` | eager loading, JoinTable                  |
| `profile`              | `OneToOne`    | `Profile`              | --                 | cascade, eager, обратная связь `profile.user` |
| `biometrics`           | `OneToMany`   | `Biometric`            | --                 | cascade, обратная связь `biometric.user`  |
| `otps`                 | `OneToOne`    | `Otp`                  | --                 | cascade, обратная связь `otp.user`        |
| `resetPasswordTokens`  | `OneToOne`    | `ResetPasswordTokens`  | --                 | cascade, обратная связь `token.user`      |
| `passkeys`             | `OneToMany`   | `Passkey`              | --                 | cascade, обратная связь `passkey.user`    |

---

## Endpoints (UserController)

Базовый путь: `/api/user`
Тег Swagger: `User`

### Эндпоинты текущего пользователя (self)

| Метод    | Путь                             | Security             | Валидация             | Описание                                          |
|----------|----------------------------------|----------------------|-----------------------|---------------------------------------------------|
| `GET`    | `/api/user/my`                   | `@Security("jwt")`   | --                    | Получение данных текущего пользователя             |
| `PATCH`  | `/api/user/my/update`            | `@Security("jwt")`   | `UserUpdateSchema`    | Обновление данных (email, phone, roleId)           |
| `DELETE` | `/api/user/my/delete`            | `@Security("jwt")`   | --                    | Удаление текущего пользователя                     |
| `PATCH`  | `/api/user/my/username`          | `@Security("jwt")`   | `SetUsernameSchema`   | Установка username                                 |
| `POST`   | `/api/user/requestVerifyEmail`   | `@Security("jwt")`   | --                    | Запрос подтверждения email (отправка OTP на почту) |
| `GET`    | `/api/user/verifyEmail/{code}`   | `@Security("jwt")`   | --                    | Подтверждение email по OTP-коду                    |
| `POST`   | `/api/user/changePassword`       | `@Security("jwt")`   | `ChangePasswordSchema`| Изменение пароля текущего пользователя             |

### Эндпоинты поиска и просмотра

| Метод    | Путь                                | Security                                     | Описание                                                     |
|----------|-------------------------------------|----------------------------------------------|--------------------------------------------------------------|
| `GET`    | `/api/user/search`                  | `@Security("jwt")`                           | Поиск пользователей (по username, email, имени, фамилии). Query: `q`, `limit?`, `offset?` |
| `GET`    | `/api/user/by-username/{username}`  | `@Security("jwt")`                           | Получение пользователя по username                           |
| `GET`    | `/api/user/all`                     | `@Security("jwt", ["permission:user:view"])` | Получение всех пользователей (пагинация, фильтр по email). Query: `offset?`, `limit?`, `query?` |
| `GET`    | `/api/user/options`                 | `@Security("jwt", ["permission:user:view"])` | Опции пользователей для выпадающих списков (id + name). Query: `query?` |
| `GET`    | `/api/user/{id}`                    | `@Security("jwt", ["permission:user:view"])` | Получение пользователя по ID                                 |

### Эндпоинты администрирования

| Метод    | Путь                           | Security                                       | Валидация              | Описание                                    |
|----------|--------------------------------|-------------------------------------------------|------------------------|---------------------------------------------|
| `PATCH`  | `/api/user/setPrivileges/{id}` | `@Security("jwt", ["permission:user:manage"])`  | `SetPrivilegesSchema`  | Установка ролей и разрешений пользователю   |
| `PATCH`  | `/api/user/update/{id}`        | `@Security("jwt", ["permission:user:manage"])`  | `UserUpdateSchema`     | Обновление данных другого пользователя      |
| `DELETE` | `/api/user/delete/{id}`        | `@Security("jwt", ["permission:user:manage"])`  | --                     | Удаление другого пользователя               |

### Используемые разрешения

- `permission:user:view` -- просмотр списка всех пользователей, получение по ID, опции
- `permission:user:manage` -- управление привилегиями, обновление и удаление других пользователей

---

## Сервисы

### UserService

Основной сервис бизнес-логики модуля. Внедряется через IoC (`@Injectable()`).

#### Зависимости конструктора

`MailerService`, `OtpService`, `UserRepository`, `RoleRepository`, `PermissionRepository`, `ProfileRepository`, `DataSource`, `EventBus`.

#### Методы

| Метод                                   | Возврат              | Описание                                                                                     |
|-----------------------------------------|----------------------|----------------------------------------------------------------------------------------------|
| `getUsers(offset?, limit?, query?)`     | `[User[], number]`   | Пагинированный список пользователей с опциональной фильтрацией по email (ILIKE)              |
| `getOptions(query?)`                    | `IUserOptionDto[]`   | Список пользователей для выпадающих списков (id + отображаемое имя)                          |
| `getUserByAttr(where)`                  | `User`               | Поиск пользователя по email или телефону. Выбрасывает `NotFoundException`                    |
| `getUser(id)`                           | `User`               | Получение пользователя по ID со всеми связями. Выбрасывает `NotFoundException`               |
| `createUser(body)`                      | `User`               | Создание пользователя в транзакции: сохранение user, создание профиля (status: Offline), назначение роли USER |
| `createAdmin(body)`                     | `User`               | Создание пользователя с ролью ADMIN. Выбрасывает `ConflictException` если уже существует     |
| `updateUser(id, body)`                  | `User`               | Обновление данных пользователя (email, phone, roleId). Выбрасывает `NotFoundException`       |
| `setChallenge(id, challenge)`           | `void`               | Установка/сброс WebAuthn challenge (TTL 5 минут)                                            |
| `setPrivileges(userId, body)`           | `User`               | Полная замена ролей и прямых разрешений. Создает роли/разрешения если не существуют. Эмитирует `UserPrivilegesChangedEvent` |
| `requestVerifyEmail(userId)`            | `boolean`            | Отправка OTP-кода на email пользователя. Выбрасывает `ConflictException` если уже подтвержден, `NotFoundException` если нет email |
| `verifyEmail(userId, code)`             | `ApiResponseDto`     | Подтверждение email по OTP-коду. Эмитирует `EmailVerifiedEvent`                              |
| `changePassword(userId, password)`      | `ApiResponseDto`     | Смена пароля (bcrypt, 12 раундов). Эмитирует `PasswordChangedEvent`                          |
| `deleteUser(userId)`                    | `boolean`            | Удаление пользователя по ID. Эмитирует `UserDeletedEvent`                                   |
| `setUsername(userId, username)`          | `User`               | Установка username (валидация: `^[a-z0-9_]{5,32}$`, проверка уникальности). Эмитирует `UsernameChangedEvent` |
| `searchUsers(query, limit?, offset?)`   | `[User[], number]`   | Поиск по username, email, firstName, lastName (ILIKE). По умолчанию limit=20, offset=0       |
| `getUserByUsername(username)`            | `User`               | Получение пользователя по username со всеми связями. Выбрасывает `NotFoundException`         |

#### Загружаемые связи (static relations)

При запросах пользователя всегда загружаются: `profile`, `roles` (с вложенными `permissions`), `directPermissions`.

---

## DTO

### UserDto (полная информация)

Возвращается для текущего пользователя и при административных операциях. Создается через `UserDto.fromEntity(entity)`.

| Поле                | Тип                | Описание                              |
|---------------------|--------------------|---------------------------------------|
| `id`                | `string`           | UUID пользователя                     |
| `email`             | `string \| null`   | Email                                 |
| `emailVerified`     | `boolean?`         | Подтвержден ли email                  |
| `phone`             | `string \| null`   | Телефон                               |
| `username`          | `string \| null`   | Username                              |
| `profile`           | `ProfileDto?`      | Профиль пользователя                  |
| `roles`             | `IRoleDto[]`       | Список ролей (через `role.toDTO()`)   |
| `directPermissions` | `IPermissionDto[]` | Прямые разрешения (через `perm.toDTO()`) |
| `createdAt`         | `Date`             | Дата создания                         |
| `updatedAt`         | `Date`             | Дата обновления                       |

### PublicUserDto (публичная информация)

Возвращается в списках, результатах поиска и для публичного просмотра. Создается через `PublicUserDto.fromEntity(entity)`.

| Поле       | Тип                | Описание                              |
|------------|---------------------|---------------------------------------|
| `userId`   | `string`            | UUID пользователя                     |
| `email`    | `string \| null`    | Email                                 |
| `username` | `string \| null`    | Username                              |
| `profile`  | `PublicProfileDto`  | Публичный профиль                     |

### IUserListDto

Пагинированный список пользователей (расширяет `IListResponseDto<PublicUserDto[]>`): `{ offset, limit, count, totalCount, data: PublicUserDto[] }`.

### IUserOptionDto

Для выпадающих списков: `{ id: string, name: string | null }`. Поле `name` содержит имя + фамилию или email, если профиль не заполнен.

### IUserOptionsDto

Обертка: `{ data: IUserOptionDto[] }`.

### IUserUpdateRequestDto (входящий)

| Поле     | Тип       | Описание             |
|----------|-----------|----------------------|
| `email`  | `string?` | Новый email          |
| `phone`  | `string?` | Новый телефон        |
| `roleId` | `string?` | UUID роли            |

### IUserPrivilegesRequestDto (входящий)

| Поле          | Тип              | Описание                                              |
|---------------|------------------|-------------------------------------------------------|
| `roles`       | `ERole[]`        | Список ролей (полностью заменяет текущие)             |
| `permissions` | `EPermissions[]` | Список прямых разрешений (полностью заменяет текущие) |

### IUserChangePasswordDto (входящий)

| Поле       | Тип      | Описание     |
|------------|----------|--------------|
| `password` | `string` | Новый пароль |

---

## Валидация (Zod-схемы)

### SetUsernameSchema

- `username` -- строка, regex `^[a-z0-9_]{5,32}$`, трансформация в lowercase.

### ChangePasswordSchema

- `password` -- строка, min 6, max 100 символов.

### UserUpdateSchema

- `email` -- опционально, формат email, max 50 символов, trim + lowercase.
- `phone` -- опционально, формат `+7XXXXXXXXXX` или `8XXXXXXXXXX`, автоматическая нормализация `8...` в `+7...`.
- `roleId` -- опционально, валидный UUID.
- Refine: хотя бы одно поле должно быть заполнено.

### SetPrivilegesSchema

- `roles` -- массив значений из `ERole`, минимум 1 элемент.
- `permissions` -- массив значений из `EPermissions`, по умолчанию `[]`.

---

## События (Events)

Модуль эмитирует 5 доменных событий через `EventBus`:

| Событие                      | Эмитируется в                  | Поля                                           |
|------------------------------|--------------------------------|------------------------------------------------|
| `EmailVerifiedEvent`         | `verifyEmail()`                | `userId: string`                               |
| `PasswordChangedEvent`       | `changePassword()`             | `userId: string`, `method: "change" \| "reset"` |
| `UserDeletedEvent`           | `deleteUser()`                 | `userId: string`                               |
| `UserPrivilegesChangedEvent` | `setPrivileges()`              | `userId: string`, `roles: string[]`, `permissions: string[]` |
| `UsernameChangedEvent`       | `setUsername()`                | `userId: string`, `username: string \| null`   |

---

## Socket-интеграция (UserListener)

`UserListener` реализует `ISocketEventListener` и зарегистрирован через `asSocketListener()` в модуле. Подписывается на доменные события `EventBus` и отправляет WebSocket-уведомления через `SocketEmitterService`.

### Обработчики

| Событие                      | Socket-событие             | Получатель         | Payload                                        |
|------------------------------|----------------------------|--------------------|------------------------------------------------|
| `EmailVerifiedEvent`         | `user:email-verified`      | `toUser(userId)`   | `{ verified: true }`                           |
| `UserDeletedEvent`           | `session:terminated`       | `toUser(userId)`   | `{ sessionId: "all" }`                         |
| `PasswordChangedEvent`       | `user:password-changed`    | `toUser(userId)`   | `{ userId, method }`                           |
| `PasswordChangedEvent`       | `session:terminated`       | `toUser(userId)`   | `{ sessionId: "*" }` (завершение всех сессий)  |
| `UserPrivilegesChangedEvent` | `user:privileges-changed`  | `toUser(userId)`   | `{ roles, permissions }`                       |
| `UsernameChangedEvent`       | `user:username-changed`    | `toUser(userId)`   | `{ userId, username }`                         |

Примечание: при смене пароля отправляются два socket-события -- уведомление о смене и команда на завершение всех сессий.

---

## Bootstrapper: AdminBootstrap

Выполняется при старте приложения (`IBootstrap.initialize()`). Выполняет:

1. Создание администратора с email и паролем из конфигурации (`config.auth.admin.email`, `config.auth.admin.password`). Пароль хешируется через bcrypt (12 раундов). Если пользователь уже существует, ошибка тихо подавляется (`.catch(() => null)`).
2. Засевание дефолтных разрешений через `RoleService.seedDefaultPermissions()`.

---

## Репозиторий (UserRepository)

Расширяет `BaseRepository<User>`, зарегистрирован через `@InjectableRepository(User)`.

### Методы

| Метод                                       | Возврат              | Описание                                                                      |
|---------------------------------------------|----------------------|-------------------------------------------------------------------------------|
| `findById(id, relations?)`                  | `User \| null`       | Поиск по ID с опциональными связями                                           |
| `findByEmail(email, relations?)`            | `User \| null`       | Поиск по email с опциональными связями                                        |
| `findByPhone(phone, relations?)`            | `User \| null`       | Поиск по телефону с опциональными связями                                     |
| `findByEmailOrPhone(email?, phone?, relations?)` | `User \| null`  | Поиск по email ИЛИ телефону; возвращает null если оба параметра пусты         |
| `updateWithResponse(id, updateData)`        | `User \| null`       | Обновление и возврат обновленной записи                                       |
| `findByUsername(username, relations?)`       | `User \| null`       | Поиск по username с опциональными связями                                     |
| `searchByQuery(query, limit, offset)`       | `[User[], number]`   | ILIKE-поиск по username, email, firstName, lastName с пагинацией (QueryBuilder) |
| `findOptions(query?)`                       | `IUserOptionDto[]`   | Список для выпадающих списков с фильтрацией по email, firstName, lastName     |

---

## Зависимости

### Внедряемые сервисы и репозитории (UserService)

| Зависимость            | Модуль       | Описание                                      |
|------------------------|--------------|-----------------------------------------------|
| `MailerService`        | Mailer       | Отправка OTP-кода на email                    |
| `OtpService`           | OTP          | Создание и проверка OTP-кодов                 |
| `UserRepository`       | User (self)  | Доступ к таблице users                        |
| `RoleRepository`       | Role         | Поиск и создание ролей                        |
| `PermissionRepository` | Permission   | Поиск и создание разрешений                   |
| `ProfileRepository`    | Profile      | Создание профиля при регистрации              |
| `DataSource`           | Core         | Транзакции при создании пользователя          |
| `EventBus`             | Core         | Эмиссия доменных событий                      |

### Внедряемые сервисы (UserListener)

| Зависимость            | Модуль       | Описание                                      |
|------------------------|--------------|-----------------------------------------------|
| `EventBus`             | Core         | Подписка на доменные события                  |
| `SocketEmitterService` | Socket       | Отправка WebSocket-уведомлений пользователям  |

### Внедряемые сервисы (AdminBootstrap)

| Зависимость            | Модуль       | Описание                                      |
|------------------------|--------------|-----------------------------------------------|
| `UserService`          | User (self)  | Создание admin-пользователя                   |
| `RoleService`          | Role         | Засевание дефолтных разрешений                |

### Регистрация в модуле (providers)

Модуль `UserModule` регистрирует в IoC: `UserRepository`, `RoleRepository`, `RoleService`, `RoleController`, `PermissionRepository`, `UserController`, `UserService`, `UserListener` (через `asSocketListener`).

Bootstrappers: `AdminBootstrap`.

---

## Взаимодействие с другими модулями

| Модуль                  | Направление          | Описание                                                                     |
|-------------------------|----------------------|------------------------------------------------------------------------------|
| **Role**                | User -> Role         | Получение и создание ролей при назначении привилегий; засевание разрешений   |
| **Permission**          | User -> Permission   | Получение и создание разрешений при назначении привилегий                    |
| **Profile**             | User -> Profile      | Создание профиля при регистрации; загрузка профиля вместе с пользователем    |
| **OTP**                 | User -> OTP          | Генерация и проверка OTP-кодов для верификации email                         |
| **Mailer**              | User -> Mailer       | Отправка писем с OTP-кодом для верификации email                             |
| **Socket**              | User -> Socket       | UserListener отправляет real-time уведомления через SocketEmitterService      |
| **Auth**                | Auth -> User         | Модуль аутентификации использует UserService для поиска и создания пользователей |
| **Biometric**           | Biometric -> User    | Связь OneToMany: биометрические данные привязаны к пользователю              |
| **Passkey**             | Passkey -> User      | Связь OneToMany: WebAuthn passkeys привязаны к пользователю; используется setChallenge() |
| **ResetPasswordTokens** | ResetPassword -> User | Связь OneToOne: токены сброса пароля привязаны к пользователю               |

---

## Тесты

- `user.service.test.ts` -- юнит-тесты UserService (Mocha + Sinon): покрытие всех основных методов (getUsers, getOptions, getUserByAttr, getUser, createUser, createAdmin, updateUser, setChallenge, setPrivileges, requestVerifyEmail, verifyEmail, changePassword, deleteUser, setUsername, searchUsers, getUserByUsername).
- `dto/user.dto.test.ts` -- тесты маппинга UserDto и PublicUserDto из entity, включая edge cases (null roles, null directPermissions, наличие/отсутствие profile).
- `validation/user.validation.test.ts` -- тесты всех Zod-схем валидации (SetUsernameSchema, ChangePasswordSchema, UserUpdateSchema, SetPrivilegesSchema).
