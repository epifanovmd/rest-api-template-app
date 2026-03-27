# Модуль Permission

Фундаментальный модуль системы разрешений (RBAC + Permission). Определяет перечисление всех доступных разрешений, сущность для хранения в БД и репозиторий. Не имеет собственного контроллера и module-файла — является зависимостью модуля Role.

## Структура файлов

```
src/modules/permission/
├── permission.entity.ts       # Entity разрешения (таблица permissions)
├── permission.repository.ts   # Репозиторий
├── permission.types.ts        # Перечисление EPermissions
├── permission.dto.ts          # DTO интерфейсы
└── index.ts                   # Публичный API модуля
```

## Entity

### Permission (таблица `permissions`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `name` | `enum(EPermissions)`, unique | Имя разрешения |
| `createdAt` / `updatedAt` | `timestamp` | Временные метки |

**Связи:** `ManyToMany` -> `Role` (обратная сторона)

### PermissionRepository

| Метод | Описание |
|-------|----------|
| `findByName(name)` | Найти разрешение по имени. |
| `findAll()` | Все разрешения с ролями. |

## Перечисление EPermissions

```typescript
enum EPermissions {
  ALL = "*",                     // Суперадмин — полный доступ
  USER_VIEW = "user:view",       // Просмотр пользователей
  USER_MANAGE = "user:manage",   // Управление пользователями
  CONTACT_VIEW = "contact:view",
  CONTACT_MANAGE = "contact:manage",
  CONTACT_ALL = "contact:*",
  CHAT_VIEW = "chat:view",
  CHAT_MANAGE = "chat:manage",
  CHAT_ALL = "chat:*",
  MESSAGE_VIEW = "message:view",
  MESSAGE_MANAGE = "message:manage",
  MESSAGE_ALL = "message:*",
  PUSH_MANAGE = "push:manage",
}
```

Поддерживается wildcard-иерархия: `*` > `chat:*` > `chat:view`.

## DTO

- **IPermissionDto** — id, name, createdAt, updatedAt
- **IPermissionListDto** — пагинированный список

## Взаимодействие

- Связан с **Role** через ManyToMany (таблица `role_permissions`)
- Используется в JWT-токенах (поле `effectivePermissions`)
- Проверяется через `TokenService.hasPermission()` с поддержкой wildcard
- Декоратор `@Security("jwt", ["permission:chat:view"])` проверяет наличие разрешения
