# Модуль Permission

## Краткое описание

Модуль **Permission** реализует систему разрешений (permissions) приложения. Он предоставляет перечисление всех доступных разрешений, сущность для хранения разрешений в базе данных, а также репозиторий для работы с ними. Модуль является фундаментальным строительным блоком системы контроля доступа (RBAC + Permission), используется в JWT-токенах, ролях и пользователях.

**Важно:** модуль не имеет собственного контроллера, сервиса или module-файла. Он выступает как инфраструктурный модуль, который используется другими модулями (User, Role, Auth).

---

## Структура файлов

```
src/modules/permission/
├── index.ts                  # Реэкспорт PermissionRepository
├── permission.entity.ts      # TypeORM-сущность Permission
├── permission.repository.ts  # Репозиторий для работы с Permission
├── permission.dto.ts         # DTO-интерфейсы
└── permission.types.ts       # Перечисление EPermissions
```

---

## Entity

### Permission (`permission.entity.ts`)

Таблица: `permissions`

| Поле        | Тип              | Описание                                  |
|-------------|------------------|-------------------------------------------|
| `id`        | `UUID` (PK)      | Уникальный идентификатор                  |
| `name`      | `enum(EPermissions)` | Уникальное имя разрешения из перечисления |
| `createdAt` | `Date`           | Дата создания (`created_at`)              |
| `updatedAt` | `Date`           | Дата обновления (`updated_at`)            |

### Связи с другими сущностями

| Связь          | Тип           | Сущность  | Описание                                                              |
|----------------|---------------|-----------|-----------------------------------------------------------------------|
| `roles`        | `ManyToMany`  | `Role`    | Роли, которым назначено это разрешение. Промежуточная таблица `role_permissions` (владеющая сторона в `Role`) |
| _(directPermissions в User)_ | `ManyToMany` | `User` | Пользователи, которым разрешение назначено напрямую. Промежуточная таблица `user_permissions` (владеющая сторона в `User`) |

### Метод `toDTO()`

Преобразует сущность в объект с полями `id`, `name`, `createdAt`, `updatedAt`.

---

## Endpoints

Модуль **не имеет собственного контроллера**. Управление разрешениями осуществляется через контроллеры других модулей:

### Через RoleController (`/roles`)

| Метод   | Путь                      | Описание                                     | Security                            |
|---------|---------------------------|----------------------------------------------|-------------------------------------|
| `PATCH` | `/roles/{id}/permissions` | Заменить набор разрешений роли               | `@Security("jwt", ["permission:user:manage"])` |

### Через UserController (`/users`)

Назначение прямых разрешений пользователю происходит при обновлении пользователя (endpoint `PATCH /users/{id}`), где в теле запроса передаётся массив `permissions: EPermissions[]`.

---

## Сервисы

Модуль **не имеет собственного сервиса**. Логика работы с разрешениями распределена по сервисам других модулей:

### RoleService (`role.service.ts`)

- **`setRolePermissions(roleId, permissions[])`** — заменяет набор разрешений роли. Для каждого разрешения ищет существующую запись в БД по имени; если не найдена, создаёт новую.
- **`seedDefaultPermissions()`** — засевает разрешения по умолчанию для ролей:
  - `ADMIN` -> `[*]` (полный доступ)
  - `USER` -> `[user:view, user:manage]`
  - `GUEST` -> `[user:view]`

### UserService (`user.service.ts`)

- При обновлении пользователя ищет или создаёт каждое разрешение из массива `permissions` и назначает их как `directPermissions` пользователя.

### TokenService (`token.service.ts`, core)

- При выдаче JWT вычисляет **эффективные разрешения** пользователя: объединение разрешений всех ролей + прямые разрешения (`directPermissions`). Все разрешения встраиваются в JWT-токен.
- При верификации запроса проверяет scopes (роли и разрешения) без обращения к БД.

### Функция `hasPermission()` (`core/auth/has-permission.ts`)

Проверяет, удовлетворяет ли набор разрешений пользователя требуемому разрешению. Поддерживает **wildcard-разрешения**:
- `*` — полный доступ (суперадмин)
- `contact:*` — доступ ко всем операциям с контактами
- `chat:*` — доступ ко всем операциям с чатами
- и т.д.

Алгоритм: проверяет точное совпадение, затем проверяет wildcards по уровням иерархии (справа налево).

---

## DTO (`permission.dto.ts`)

### IPermissionDto

```typescript
interface IPermissionDto {
  id: string;
  name: EPermissions;
  createdAt: Date;
  updatedAt: Date;
}
```

### IPermissionListDto

```typescript
interface IPermissionListDto extends IListResponseDto<IPermissionDto[]> {}
```

Расширяет стандартный `IListResponseDto` для пагинированного ответа со списком разрешений.

---

## Перечисление EPermissions (`permission.types.ts`)

Все доступные разрешения в системе:

| Константа          | Значение         | Описание                                                    |
|--------------------|------------------|-------------------------------------------------------------|
| `ALL`              | `*`              | Суперадминский доступ ко всему                              |
| `USER_VIEW`        | `user:view`      | Просмотр списка пользователей и их профилей                 |
| `USER_MANAGE`      | `user:manage`    | Создание, редактирование, блокировка пользователей          |
| `CONTACT_VIEW`     | `contact:view`   | Просмотр контактов                                          |
| `CONTACT_MANAGE`   | `contact:manage` | Управление контактами                                       |
| `CONTACT_ALL`      | `contact:*`      | Wildcard: все операции с контактами                         |
| `CHAT_VIEW`        | `chat:view`      | Просмотр чатов                                              |
| `CHAT_MANAGE`      | `chat:manage`    | Управление чатами                                           |
| `CHAT_ALL`         | `chat:*`         | Wildcard: все операции с чатами                             |
| `MESSAGE_VIEW`     | `message:view`   | Просмотр сообщений                                          |
| `MESSAGE_MANAGE`   | `message:manage` | Управление сообщениями                                      |
| `MESSAGE_ALL`      | `message:*`      | Wildcard: все операции с сообщениями                        |
| `PUSH_MANAGE`      | `push:manage`    | Управление push-уведомлениями                               |

---

## События (Events)

Модуль **не имеет собственных событий**.

---

## Socket-интеграция

Модуль **не имеет прямой socket-интеграции**.

---

## Зависимости

### Внутренние зависимости модуля

- `BaseRepository`, `InjectableRepository` — из `../../core`
- `IListResponseDto` — из `../../core`

### Внешние зависимости (кто импортирует Permission)

| Модуль/Файл                        | Что используется                       | Для чего                                                |
|-------------------------------------|----------------------------------------|---------------------------------------------------------|
| `Role` (entity)                     | `Permission` (entity)                  | ManyToMany-связь `role_permissions`                     |
| `User` (entity)                     | `Permission` (entity)                  | ManyToMany-связь `user_permissions` (directPermissions) |
| `UserModule`                        | `PermissionRepository`                 | Регистрация в IoC-контейнере                            |
| `UserService`                       | `PermissionRepository`                 | Назначение прямых разрешений пользователю               |
| `RoleService`                       | `PermissionRepository`, `EPermissions` | Управление разрешениями ролей, seed                     |
| `TokenService` (core)              | `EPermissions`                         | Формирование и проверка JWT-токенов                     |
| `hasPermission()` (core)           | `EPermissions`                         | Wildcard-проверка разрешений                            |
| `jwt.ts` (core)                     | `EPermissions`                         | Типизация payload JWT                                   |
| `koa.ts` (types)                    | `EPermissions`                         | Типизация `AuthContext.permissions`                     |

---

## Взаимодействие с другими модулями

```
                    ┌─────────────┐
                    │  Permission │
                    │   (entity,  │
                    │  repository,│
                    │    types)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐
        │   Role     │ │  User  │ │  Core    │
        │  (entity,  │ │(entity,│ │  (auth,  │
        │  service)  │ │service)│ │  token)  │
        └────────────┘ └────────┘ └──────────┘
```

1. **Role -> Permission**: Роль содержит набор разрешений через ManyToMany (таблица `role_permissions`). `RoleService` управляет назначением разрешений ролям и засеивает дефолтные разрешения.

2. **User -> Permission**: Пользователь может иметь прямые разрешения (`directPermissions`) через ManyToMany (таблица `user_permissions`), помимо разрешений, унаследованных от ролей.

3. **Core Auth -> Permission**: `TokenService` вычисляет эффективные разрешения при выдаче JWT (объединение ролевых + прямых). `hasPermission()` проверяет наличие разрешения с поддержкой wildcards при каждом запросе.

4. **Контроллеры -> Permission**: Все защищённые endpoints используют строки из `EPermissions` в декораторе `@Security("jwt", ["permission:..."])` для проверки доступа.

---

## Особенности

- **Нет собственного `@Module`**: `PermissionRepository` регистрируется в `UserModule.providers`, а не в отдельном модуле.
- **Upsert-стратегия**: При назначении разрешений (в RoleService и UserService) разрешение ищется по имени; если не найдено — автоматически создаётся в БД.
- **Wildcard-иерархия**: Разрешения поддерживают wildcards (`*`, `domain:*`), что позволяет одним разрешением покрыть целую группу операций.
- **Без обращений к БД при проверке**: Все разрешения встраиваются в JWT-токен при его выдаче, поэтому проверка разрешений при каждом запросе не требует обращения к базе данных.
