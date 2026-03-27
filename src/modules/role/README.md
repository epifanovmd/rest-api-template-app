# Модуль Role

Модуль управления ролями пользователей и их разрешениями. Предоставляет API для просмотра ролей и назначения разрешений, а также начальное заполнение (seeding) ролей с дефолтными разрешениями.

## Структура файлов

```
src/modules/role/
├── role.entity.ts                       # Entity роли (таблица roles)
├── role.repository.ts                   # Репозиторий ролей
├── role.service.ts                      # Сервис управления ролями
├── role.controller.ts                   # REST-контроллер (tsoa)
├── role.types.ts                        # Перечисление ERole
├── role.dto.ts                          # DTO интерфейсы
├── validation/
│   ├── role-permissions.validate.ts     # SetRolePermissionsSchema
│   └── index.ts                         # Реэкспорт валидаций
├── role.service.test.ts                 # Тесты
└── index.ts                             # Публичный API модуля
```

Примечание: модуль не имеет отдельного `role.module.ts` — регистрация происходит в родительском модуле.

## Entity

### Role (таблица `roles`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `name` | `enum(ERole)`, unique | Название роли |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Связи:** `ManyToMany` -> `Permission` (через таблицу `role_permissions`, eager loading)

## Endpoints

Базовый путь: `/api/roles`

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/roles` | `@Security("jwt", ["permission:user:manage"])` | Все роли с их разрешениями. |
| `PATCH` | `/api/roles/{id}/permissions` | `@Security("jwt", ["permission:role:manage"])` + `@ValidateBody(SetRolePermissionsSchema)` | Установить разрешения роли (полная замена). |

## Сервисы

### RoleService

| Метод | Описание |
|-------|----------|
| `getRoles()` | Получить все роли с разрешениями. |
| `setRolePermissions(roleId, permissions)` | Заменить разрешения роли. Создаёт несуществующие permissions. |
| `seedDefaultPermissions()` | Засеять дефолтные разрешения для каждой роли (ADMIN: `*`, USER: `user:view` + `user:manage`, GUEST: `user:view`). Только если у роли нет разрешений. |

## DTO

- **IRoleDto** — id, name, createdAt, updatedAt, permissions: IPermissionDto[]
- **IRoleListDto** — пагинированный список

## Перечисления

```typescript
enum ERole { ADMIN = "admin", USER = "user", GUEST = "guest" }
```

## Дефолтные разрешения

| Роль | Разрешения |
|------|-----------|
| ADMIN | `*` (полный доступ) |
| USER | `user:view`, `user:manage` |
| GUEST | `user:view` |

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `Permission` entity | `modules/permission` | ManyToMany связь |
| `PermissionRepository` | `modules/permission` | Поиск/создание разрешений при setRolePermissions |
