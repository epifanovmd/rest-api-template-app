# Модуль Permission

Справочник прав (RBAC + permissions): сущность, репозиторий, **реестр прав модулей** и
каталог прав с подписями. Module-файла нет — провайдеры (включая `PermissionController`)
регистрируются в `UserModule`.

## Структура файлов

```
src/modules/permission/
├── permission.entity.ts          # Permission (таблица permissions)
├── permission.repository.ts      # Репозиторий
├── permission.registry.ts        # definePermissions, getRegisteredPermissions, getPermissionCatalog
├── permission.controller.ts      # GET /api/v1/permissions — каталог прав
├── permission.types.ts           # TPermission, PermissionName
├── permission.dto.ts             # IPermissionDto, IPermissionListDto, IPermissionCatalogDto
├── permission.registry.test.ts
└── index.ts
```

## Реестр прав

Модуль объявляет свои права сам — группой с подписью; общий файл при добавлении модуля
не правится:

```ts
export const ReportPermissions = definePermissions(
  "report",
  { key: "report", label: "Отчёты" },
  {
    VIEW: { name: "report:view", label: "Просмотр" },
    EXPORT: { name: "report:export", label: "Выгрузка" },
  },
);
```

- Ключ группы — `<domain>` или `<domain>:<сущность>`; каждое право —
  `<ключ группы>:<действие>` (сегменты `a-z0-9-`, последний может быть `*`),
  ≤ 100 символов; чужой домен, пустая подпись группы или неверный формат →
  `PERMISSION_INVALID_DEFINITION` при загрузке модуля.
- Возвращается замороженный объект `KEY → имя права`.
- Повторное объявление тех же имён идемпотентно; подпись — последняя объявленная.
- `scoped: true` — действие над сущностью с владельцем: кроме права на все сущности
  регистрируется `<имя>:own` — только на свои (см. «Области прав»). Имя с сегментом
  `:own` в конце напрямую не объявляется, scoped-wildcard запрещён; длина проверяется
  с учётом `:own`.
- Объявление должно быть импортировано при старте: экспортируйте его из `index.ts`
  модуля.
- `getRegisteredPermissions()` — все права: `*`, объявленные модулями и их варианты
  `:own` (без повторов, отсортированы). Засев (`RoleService.seedDefaultPermissions`) создаёт в БД каждое из
  них.
- `getPermissionCatalog()` — группы в порядке объявления, права с подписями и `own`
  (имя права «только на свои» у scoped-действия); первая группа — `*` «Система»
  (полный доступ).
- `getDomainPermissions(domain)` — права домена; `unregisterPermissionDomain(domain)` —
  только для тестов.

`TPermission` — строка `domain:action` (или `domain:*`); закрытого перечня прав в коде
нет. Права — на отдельные действия (`create`/`update`/`delete` и специальные), общего
`manage` нет.

Объявления в модулях: `UserPermissions` (user), `RolePermissions` (role),
`ProfilePermissions` (profile), `ApiKeyPermissions` (apikey), `AuditPermissions`
(audit), `JobsPermissions` (jobs), `FilePermissions` (file — пример scoped-прав:
`file:view`, `file:delete` и их `:own`).

Строки в `@Security("jwt", ["permission:…"])` остаются литералами: генератор
маршрутов читает декораторы статически. Тест `src/routing/spec.test.ts` проверяет, что
каждое `permission:`-право в спецификации объявлено в реестре.

## REST: `/api/v1/permissions`

| Метод | Путь | Доступ | Ответ                   | Описание                                              |
| ----- | ---- | ------ | ----------------------- | ----------------------------------------------------- |
| `GET` | `/`  | jwt    | `IPermissionCatalogDto` | Каталог прав по группам — для редакторов ролей и прав |

Ответ: `{ groups: [{ key, label, permissions: [{ name, label, own? }] }] }` — у
scoped-действия `own` — имя права «только на свои»; редактор показывает для действия
выбор «нет / свои / все».

## Entity: Permission (`permissions`)

| Поле                      | Тип                    | Описание                 |
| ------------------------- | ---------------------- | ------------------------ |
| `id`                      | `uuid` (PK)            | Уникальный идентификатор |
| `name`                    | `varchar(100)`, unique | Имя права                |
| `createdAt` / `updatedAt` | `timestamptz`          | Временные метки          |

Связь: M:N → `Role` (обратная сторона, `role_permissions`).

## PermissionRepository

| Метод                | Описание                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| `findByName(name)`   | Найти право по имени.                                                     |
| `findByNames(names)` | Права по списку имён (отсутствующие не попадают в результат).             |
| `findAll()`          | Все права с ролями.                                                       |
| `ensureByName(name)` | Вернуть право, создав при отсутствии (`INSERT … ON CONFLICT DO NOTHING`). |

Прямые права пользователю (`setPrivileges`) выдаются только из существующих записей;
новые права также появляются через `PATCH /api/v1/roles/{id}/permissions`.

## Проверка

Wildcard-иерархия: `*` > `user:*` > `user:view` (`core/auth/has-permission.ts`).
Право на все покрывает то же право «только на свои»: `report:delete` ⊃ `report:delete:own`
(и `report:*`, `*` тоже); обратное неверно.
Эффективные права кладутся в JWT при выдаче; `@Security("jwt", ["permission:user:view"])`
проверяет их без БД. После смены прав пользователя его access-токены, выданные раньше,
отклоняются с `AUTH_PRIVILEGES_CHANGED` (401) — клиент обновляет токен. Места без
HTTP-контекста (политики сокет-комнат, слушатели) проверяют права по userId из БД через
`AccessService` ядра (`core/auth/access.ts`).

## Области прав «все / свои»

Для действий над сущностями с владельцем (`scoped: true`) доступ бывает двух областей:
`<право>` — над всеми, `<право>:own` — только над своими (пользователь — владелец или
создатель). Ядро (`core/auth/access-scope.ts`):

- `resolveScope(roles, permissions, permission)` → `"all" | "own" | null`;
  `AccessService.scope(userId, permission)` — то же по userId из БД.
- `OwnedAccess<T>({ owner, creator? })` — объект доступа сущности (обычно
  `<feature>.access.ts`): `scope`, `isOwn`, `can(actor, permission, entity)`,
  `filter(actor, permission)` (`{}` — все, `{ ownedBy }` — свои, `null` — нет права),
  `listFilter(actor, permission, mine?)` (фильтр «Мои»), `ownedCondition(alias)` для
  QueryBuilder (`:ownedBy`), `ownedWhere(userId)` для `find`.
- На маршруте — `@Security("jwt", ["permission:<право>:own"])`: его проходят и
  держатели права на все. Сервис проверяет область на конкретной сущности: невидимая
  (нет права просмотра на неё) — 404, видимая без права на действие — 403.
- Сокет: `OwnedEntityEmitter` (модуль socket) — событие лично владельцам с областью
  `own` (держатели права на все получают его в комнате списка), `detach` — сущность
  перестала быть своей.

Смена смысла существующих прав (право стало scoped, прежнее «свои»-право разделено) —
миграцией данных: кто имел прежнее право (роль, прямое право, scope API-ключа), получает
новые.

## DTO

- **IPermissionDto** — id, name, createdAt, updatedAt
- **IPermissionListDto** — `IPaginatedDto<IPermissionDto>`
- **IPermissionCatalogDto** — `{ groups: IPermissionCatalogGroupDto[] }`; группа —
  `key`, `label`, `permissions: { name, label, own? }[]`

## Ошибки

`PERMISSION_INVALID_DEFINITION` (500) — некорректное объявление в `definePermissions`.

## Тесты

`permission.registry.test.ts` — регистрация, идемпотентность, формат и домен, группы и
подписи каталога, scoped-права (`:own` в реестре и каталоге, запреты объявления, длина).
