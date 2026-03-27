# Модуль Role

Модуль управления ролями пользователей и их разрешениями. Предоставляет CRUD-операции для ролей, механизм назначения разрешений (permissions) ролям, а также начальное заполнение (seeding) ролей с разрешениями по умолчанию.

## Структура файлов

```
src/modules/role/
├── index.ts                              # Реэкспорт: RoleController, RoleRepository, RoleService
├── role.entity.ts                        # TypeORM-сущность Role
├── role.types.ts                         # Enum ERole (admin, user, guest)
├── role.dto.ts                           # DTO-интерфейсы IRoleDto, IRoleListDto
├── role.repository.ts                    # Репозиторий RoleRepository (extends BaseRepository)
├── role.service.ts                       # Бизнес-логика: получение ролей, назначение прав, seeding
├── role.controller.ts                    # REST-контроллер (tsoa), 2 endpoint-а
├── role.service.test.ts                  # Unit-тесты сервиса (Mocha + Sinon + Chai)
└── validation/
    ├── index.ts                          # Реэкспорт валидационных схем
    └── role-permissions.validate.ts      # Zod-схема SetRolePermissionsSchema
```

## Entity

### Role (`roles`)

| Поле          | Тип                  | Описание                                |
|---------------|----------------------|-----------------------------------------|
| `id`          | `uuid` (PK, auto)   | Уникальный идентификатор роли           |
| `name`        | `enum(ERole)`        | Название роли: `admin`, `user`, `guest` |
| `createdAt`   | `timestamp`          | Дата создания (auto)                    |
| `updatedAt`   | `timestamp`          | Дата последнего обновления (auto)       |
| `permissions` | `Permission[]`       | Связанные разрешения (ManyToMany, eager)|

### Связи

- **ManyToMany с `Permission`** -- через промежуточную таблицу `role_permissions` (поля: `role_id`, `permission_id`). Роль является владельцем связи (`@JoinTable`). Загрузка eager -- при запросе роли разрешения подтягиваются автоматически.
- **ManyToMany с `User`** -- через промежуточную таблицу `user_roles` (поля: `user_id`, `role_id`). Владелец связи -- сущность `User`. Пользователь может иметь несколько ролей, роль может быть у нескольких пользователей.

### Enum ERole

```typescript
enum ERole {
  ADMIN = "admin",
  USER  = "user",
  GUEST = "guest",
}
```

## Endpoints

Базовый путь: `/api/roles`

| Метод   | Путь                       | Описание                                           | Security                              |
|---------|----------------------------|------------------------------------------------------|---------------------------------------|
| `GET`   | `/api/roles`               | Получить все роли с их разрешениями                  | `jwt` + `permission:user:manage`      |
| `PATCH` | `/api/roles/{id}/permissions` | Заменить набор разрешений роли указанным списком   | `jwt` + `role:admin`                  |

### GET /api/roles

- **Описание:** Возвращает список всех ролей с привязанными разрешениями.
- **Security:** Требуется JWT-токен и разрешение `user:manage`.
- **Ответ:** `IRoleDto[]`

### PATCH /api/roles/{id}/permissions

- **Описание:** Полностью заменяет текущий набор разрешений роли на переданный. Если переданное разрешение не существует в БД, оно будет создано автоматически.
- **Security:** Требуется JWT-токен и роль `admin`.
- **Валидация тела:** `SetRolePermissionsSchema` (Zod) -- массив значений из `EPermissions`.
- **Тело запроса:** `{ permissions: EPermissions[] }`
- **Ответ:** `IRoleDto`

## Сервисы

### RoleService

Основной сервис бизнес-логики модуля. Зависит от `RoleRepository` и `PermissionRepository`.

#### Методы

| Метод                      | Описание                                                                                          |
|----------------------------|---------------------------------------------------------------------------------------------------|
| `getRoles()`               | Возвращает все роли из БД с загруженными разрешениями.                                            |
| `setRolePermissions(roleId, permissions)` | Заменяет набор разрешений указанной роли. Создает недостающие разрешения (upsert). Бросает `NotFoundException` если роль не найдена. |
| `seedDefaultPermissions()` | Начальное заполнение ролей. Создает роли из `ERole`, если их нет, и назначает дефолтные разрешения только если у роли их ещё нет (не перезаписывает ручные изменения). |

#### Дефолтные разрешения

```
ADMIN -> [ALL]            (полный доступ через wildcard)
USER  -> [USER_VIEW, USER_MANAGE]
GUEST -> [USER_VIEW]
```

### RoleRepository

Расширяет `BaseRepository<Role>`. Зарегистрирован через `@InjectableRepository(Role)`.

| Метод                           | Описание                                                       |
|---------------------------------|----------------------------------------------------------------|
| `findById(id)`                  | Поиск роли по ID с загрузкой разрешений                        |
| `findByName(name: ERole)`       | Поиск роли по имени с загрузкой разрешений                     |
| `findAll()`                     | Получение всех ролей с разрешениями                            |
| `updateWithResponse(id, data)`  | Обновление роли и возврат обновлённой записи с разрешениями    |

## DTO

### IRoleDto

```typescript
interface IRoleDto {
  id: string;
  name: ERole;
  createdAt: Date;
  updatedAt: Date;
  permissions: IPermissionDto[];
}
```

### IRoleListDto

```typescript
interface IRoleListDto extends IListResponseDto<IRoleDto[]> {}
```

### IRolePermissionsRequestDto

Определен в контроллере. Используется как тело запроса для `PATCH /api/roles/{id}/permissions`.

```typescript
interface IRolePermissionsRequestDto {
  permissions: EPermissions[];
}
```

## Валидация

### SetRolePermissionsSchema (Zod)

Валидирует тело запроса на установку разрешений роли:

- `permissions` -- массив значений из перечисления `EPermissions`. По умолчанию пустой массив (`default([])`).
- При невалидном значении выдает сообщение с перечислением допустимых разрешений.

## События

Модуль не генерирует и не подписывается на доменные события через `EventBus`.

## Socket-интеграция

Модуль не имеет socket-интеграции.

## Зависимости

### Используемые модули и сущности

- **Permission** (`src/modules/permission/`) -- `PermissionRepository` используется в `RoleService` для поиска и создания разрешений. Entity `Permission` связана с `Role` через ManyToMany.
- **Core** (`src/core/`) -- `BaseRepository`, `InjectableRepository`, `Injectable`, `ValidateBody`, `IListResponseDto`, `Module`.

### Внешние зависимости

- `inversify` -- DI-контейнер (`@inject`)
- `tsoa` -- генерация REST-маршрутов и Swagger
- `typeorm` -- ORM, entity, repository
- `zod` -- валидация входных данных
- `@force-dev/utils` -- `NotFoundException`

## Взаимодействие с другими модулями

### User-модуль (`src/modules/user/`)

Модуль Role не имеет собственного `@Module`-файла. Все его провайдеры (`RoleController`, `RoleRepository`, `RoleService`) регистрируются в IoC-контейнере через `UserModule`:

```typescript
@Module({
  providers: [
    UserRepository, RoleRepository, RoleService, RoleController,
    PermissionRepository, UserController, UserService,
  ],
  bootstrappers: [AdminBootstrap],
})
export class UserModule {}
```

- **`UserService`** -- использует `RoleRepository` для назначения ролей пользователям при регистрации/обновлении.
- **`AdminBootstrap`** -- вызывает `RoleService.seedDefaultPermissions()` при старте приложения для начального заполнения ролей и их разрешений.

## Тесты

Файл `role.service.test.ts` содержит unit-тесты для `RoleService` (Mocha + Sinon + Chai):

- **getRoles** -- проверяет возврат списка ролей.
- **setRolePermissions** -- проверяет обновление разрешений, автоматическое создание несуществующих разрешений, выброс `NotFoundException` при отсутствии роли.
- **seedDefaultPermissions** -- проверяет создание всех трёх ролей с дефолтными разрешениями, а также то, что существующие разрешения не перезаписываются.
