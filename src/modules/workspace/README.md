# Модуль Workspace

Рабочие пространства — базовая multi-tenancy для проектов на шаблоне. Пространство
владеет участниками с ролями, приглашениями по email и комнатой сокета. Доменные
модули проекта (документы, датасеты, «проекты» в ml-labeling) привязывают свои данные
к `workspaceId` и проверяют доступ через `WorkspaceAccessService` или декоратор
`@WorkspaceRole`.

---

## Структура файлов

```
src/modules/workspace/
├── workspace.entity.ts               # Workspace (workspaces)
├── workspace-member.entity.ts        # WorkspaceMember (workspace_members)
├── workspace-invite.entity.ts        # WorkspaceInvite (workspace_invites)
├── workspace.types.ts                # WorkspaceRoles, ранги, комнаты, TTL, длины колонок
├── workspace.errors.ts               # WorkspaceError — коды WORKSPACE_*
├── workspace.repository.ts           # пространства, «сироты», пространства без владельца
├── workspace-member.repository.ts    # членства, страницы, кандидат во владельцы
├── workspace-invite.repository.ts    # приглашения, атомарные accept/revoke
├── workspace-role.cache.ts           # кэш роли: Redis или память, TTL 30 с
├── workspace-access.service.ts       # require / roleOf / invalidate
├── workspace-role.decorator.ts       # @WorkspaceRole + getWorkspaceMember
├── workspace.service.ts              # CRUD, передача владения, очистка после удаления пользователя
├── workspace-member.service.ts       # список, смена роли, удаление, выход
├── workspace-invite.service.ts       # приглашения: создать, список, отозвать, принять
├── workspace-invite.mail.ts          # письмо-приглашение через очередь mail.send
├── workspace.controller.ts           # /api/v1/workspaces — пространства и участники
├── workspace-invite.controller.ts    # /api/v1/workspaces — приглашения
├── workspace.listener.ts             # события → сокет; UserDeletedEvent → очистка
├── workspace.room-provider.ts        # автоподписка на комнаты своих пространств
├── workspace.room-policy.ts          # room:subscribe { type: "workspace" }
├── workspace-job-access.policy.ts    # IJobAccessPolicy для scope workspace
├── dto/  events/  validation/
└── *.test.ts
```

---

## Сущности

### Workspace (`workspaces`)

| Поле          | Тип                                | Описание                                                      |
| ------------- | ---------------------------------- | ------------------------------------------------------------- |
| `id`          | `uuid` PK                          |                                                               |
| `name`        | `varchar(100)`                     | Название                                                      |
| `slug`        | `varchar(64)`, unique              | Адрес: `[a-z0-9-]`, без дефиса по краям                       |
| `description` | `text` nullable                    | Описание, до 1000 символов; пустая строка очищает             |
| `ownerId`     | `uuid` nullable → `users` SET NULL | Дублирует участника-owner; `null` — владелец удалён           |
| `createdAt`   | `timestamptz`                      |                                                               |
| `updatedAt`   | `timestamptz`                      |                                                               |
| `archivedAt`  | `timestamptz` nullable             | Архив: скрыт из списка «мои пространства», доступ не меняется |

Индексы: `IDX_WORKSPACES_SLUG` (unique), `IDX_WORKSPACES_OWNER`.

### WorkspaceMember (`workspace_members`)

| Поле          | Тип                           | Описание         |
| ------------- | ----------------------------- | ---------------- |
| `id`          | `uuid` PK                     |                  |
| `workspaceId` | `uuid` → `workspaces` CASCADE |                  |
| `userId`      | `uuid` → `users` CASCADE      |                  |
| `role`        | `varchar(16)`                 | `TWorkspaceRole` |
| `createdAt`   | `timestamptz`                 | Время вступления |
| `updatedAt`   | `timestamptz`                 |                  |

Индексы: `IDX_WORKSPACE_MEMBERS_WORKSPACE_USER` (unique), `IDX_WORKSPACE_MEMBERS_USER`,
`IDX_WORKSPACE_MEMBERS_WORKSPACE_ROLE`.

### WorkspaceInvite (`workspace_invites`)

| Поле          | Тип                                | Описание                                   |
| ------------- | ---------------------------------- | ------------------------------------------ |
| `id`          | `uuid` PK                          |                                            |
| `workspaceId` | `uuid` → `workspaces` CASCADE      |                                            |
| `email`       | `varchar(50)`                      | В нижнем регистре                          |
| `role`        | `varchar(16)`                      | Роль после принятия (не owner)             |
| `tokenHash`   | `varchar(64)`, unique              | sha256 токена; сам токен — только в письме |
| `invitedBy`   | `uuid` nullable → `users` SET NULL |                                            |
| `expiresAt`   | `timestamptz`                      | Создание + 7 дней                          |
| `acceptedAt`  | `timestamptz` nullable             |                                            |
| `revokedAt`   | `timestamptz` nullable             |                                            |
| `createdAt`   | `timestamptz`                      |                                            |

Статус в DTO (`pending | accepted | revoked | expired`) вычисляется из дат.

---

## Роли

`WorkspaceRoles` — const-объект, иерархия `owner ⊃ admin ⊃ editor ⊃ viewer`
(`workspaceRoleCovers(role, required)`). Набор закрыт: от него зависит ранг.

| Роль     | Может                                                                   |
| -------- | ----------------------------------------------------------------------- |
| `viewer` | читать пространство и список участников                                 |
| `editor` | + изменять содержимое (решают доменные модули), отменять задачи         |
| `admin`  | + настройки, архив, участники, приглашения                              |
| `owner`  | + удаление пространства и передача владения; ровно один на пространство |

Суперпользователь (роль `admin` или право `*` в `AuthContext`) проходит любую проверку
без членства с ролью `owner` (`viaSuperuser: true`). Проверки по голому `userId`
(сокет, задачи) суперпользователя не учитывают.

---

## Проверка доступа

### `WorkspaceAccessService`

- `require(actor, workspaceId, minRole)` → `IWorkspaceMembership { workspaceId, userId, role, viaSuperuser }`.
  `actor` — `AuthContext` (учитывается суперпользователь) или `userId`.
  - не участник и несуществующее пространство неразличимы → `WORKSPACE_NOT_FOUND` (404);
  - роли не хватает → `WORKSPACE_FORBIDDEN` (403).
- `roleOf(userId, workspaceId)` → роль или `null`.
- `isMember(userId, workspaceId)`.
- `invalidate(workspaceId, userIds)` — вызывается после каждого изменения членства
  (после коммита).

Роль кэшируется на 30 с (`WorkspaceRoleCache`): с `REDIS_URL` — в Redis
(`workspace:role:<workspaceId>:<userId>`), общий для реплик, инвалидация видна всем
процессам; без Redis (один процесс) — в памяти. Кэшируется и отрицательный ответ.
Сбой Redis не ломает проверку: кэш пропускается, роль читается из БД.

### Декоратор `@WorkspaceRole`

Middleware tsoa (`Middlewares`), работает после `@Security`: берёт пользователя из
запроса, id — из `ctx.params[param]` (по умолчанию `workspaceId`), вызывает `require` и
кладёт членство в `ctx.state.workspaceMember`. В контроллере — `getWorkspaceMember(req)`
(без декоратора — 500).

```ts
@Security("jwt")
@WorkspaceRole("editor", { param: "workspaceId" })
@Post("{workspaceId}/documents")
create(@Request() req: KoaRequest, @Path() workspaceId: UUID, @Body() body: ICreateDocumentBody) {
  return this._documents.create(getWorkspaceMember(req), body);
}
```

---

## Эндпоинты

Все — `@Security("jwt")`, префикс `api/v1/workspaces`. Списки — `IPaginatedDto`
(`offset`, `limit`, по умолчанию 20, максимум 100).

| Метод  | Путь                       | Роль     | Описание                                                          |
| ------ | -------------------------- | -------- | ----------------------------------------------------------------- |
| POST   | `/`                        | —        | Создать (201); создатель — owner; без `slug` он генерируется      |
| GET    | `/`                        | —        | Мои пространства с моей ролью; `includeArchived=true` — с архивом |
| GET    | `/{id}`                    | viewer   | Пространство                                                      |
| PATCH  | `/{id}`                    | admin    | `name`, `slug`, `description`, `archived`                         |
| DELETE | `/{id}`                    | owner    | Удалить с участниками и приглашениями (204)                       |
| POST   | `/{id}/transfer-ownership` | owner    | `{ userId }` — участнику; прежний владелец становится admin       |
| GET    | `/{id}/members`            | viewer   | Участники, по времени вступления                                  |
| PATCH  | `/{id}/members/{userId}`   | admin    | `{ role }` — не выше своей; owner и старших не трогать            |
| DELETE | `/{id}/members/{userId}`   | admin    | Удалить участника (себя — это выход) (204)                        |
| POST   | `/{id}/leave`              | участник | Выйти (204); владелец — сначала передача                          |
| POST   | `/{id}/invites`            | admin    | `{ email, role }` (201); письмо со ссылкой                        |
| GET    | `/{id}/invites`            | admin    | Приглашения во всех состояниях                                    |
| DELETE | `/{id}/invites/{inviteId}` | admin    | Отозвать (204); повторно — без ошибки, принятое — 409             |
| POST   | `/invites/accept`          | —        | `{ token }` → пространство с ролью                                |

---

## Правила

- Создание — транзакция: пространство + участник-owner.
- Смена роли и удаление участника: `admin` и выше; нельзя назначить роль выше своей
  (`WORKSPACE_ROLE_TOO_HIGH`), трогать owner и участника с рангом выше своего
  (`WORKSPACE_CANNOT_MANAGE_MEMBER`); owner назначается только передачей
  (`WORKSPACE_OWNER_ROLE_VIA_TRANSFER`).
- Передача владения блокирует строку пространства (`FOR UPDATE`): двух владельцев не будет.
- Владелец не может выйти (`WORKSPACE_OWNER_CANNOT_LEAVE`).
- Приглашение: новое на тот же email отзывает прежнее действующее; уже участник —
  `WORKSPACE_ALREADY_MEMBER`. Токен — 32 случайных байта (base64url), в БД — sha256.
  Письмо ставится в очередь `mail.send` в той же транзакции (outbox).
- Принятие: email приглашения должен совпасть с email пользователя (без учёта
  регистра), иначе `WORKSPACE_INVITE_EMAIL_MISMATCH`. Неподтверждённый email
  подтверждается принятием: токен приходит только в этот ящик. Приглашение гасится
  атомарным условным `UPDATE` — повторное/параллельное принятие даёт
  `WORKSPACE_INVITE_ALREADY_USED`. Уже участник — роль не меняется.
- Удаление пользователя (`UserDeletedEvent`, приходит после удаления — членства уже
  сняты каскадом): пространства без участников удаляются; где не осталось owner —
  владение переходит старейшему admin, иначе старейшему участнику. Проход
  идемпотентен и подбирает хвосты прошлых сбоев; ошибки изолированы по пространствам.

### Ошибки (`WorkspaceError`)

| Код                                 | Статус |
| ----------------------------------- | ------ |
| `WORKSPACE_NOT_FOUND`               | 404    |
| `WORKSPACE_FORBIDDEN`               | 403    |
| `WORKSPACE_SLUG_TAKEN`              | 409    |
| `WORKSPACE_MEMBER_NOT_FOUND`        | 404    |
| `WORKSPACE_ALREADY_MEMBER`          | 409    |
| `WORKSPACE_ROLE_TOO_HIGH`           | 403    |
| `WORKSPACE_OWNER_ROLE_VIA_TRANSFER` | 400    |
| `WORKSPACE_CANNOT_MANAGE_MEMBER`    | 403    |
| `WORKSPACE_OWNER_CANNOT_LEAVE`      | 409    |
| `WORKSPACE_TRANSFER_TO_SELF`        | 400    |
| `WORKSPACE_INVITE_NOT_FOUND`        | 404    |
| `WORKSPACE_INVITE_EXPIRED`          | 410    |
| `WORKSPACE_INVITE_ALREADY_USED`     | 409    |
| `WORKSPACE_INVITE_EMAIL_MISMATCH`   | 403    |

---

## События

| Событие                           | Поля                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `WorkspaceMemberAddedEvent`       | `workspaceId`, `userId`, `role`, `actorId`                 |
| `WorkspaceMemberRemovedEvent`     | `workspaceId`, `userId`, `actorId` (= `userId` при выходе) |
| `WorkspaceMemberRoleChangedEvent` | `workspaceId`, `userId`, `role`, `previousRole`, `actorId` |
| `WorkspaceDeletedEvent`           | `workspaceId`, `memberUserIds`, `actorId`                  |

Слушает: `UserDeletedEvent` → `WorkspaceService.handleUserDeleted`.

## Сокет

- Комната пространства — `workspace_<id>`. `WorkspaceRoomProvider` (`asSocketRoomProvider`)
  при подключении вводит сокет в комнаты всех пространств пользователя.
- `WorkspaceRoomPolicy` (`asSocketRoomPolicy`): `room:subscribe { type: "workspace", id }` —
  только участнику.
- `WorkspaceListener`:

| Доменное событие | Действие                                                              |
| ---------------- | --------------------------------------------------------------------- |
| MemberAdded      | `joinRoom` + `workspace:member-added` в комнату                       |
| MemberRemoved    | `leaveRoom` + `workspace:member-removed` в комнату и самому участнику |
| RoleChanged      | `workspace:member-role-changed` в комнату                             |
| Deleted          | `workspace:deleted` каждому участнику + `leaveRoom`                   |

## Задачи

`WorkspaceJobAccessPolicy` (`asJobAccessPolicy`, scope `workspace`): задачи со
`scope: { type: "workspace", id }` видят все участники, отменяют — `editor` и выше.
Постановка: `jobs.enqueue(queue, data, { scope: { type: "workspace", id }, ownerId, title })`.

## Конфиг

| Переменная                   | По умолчанию                                              | Что задаёт                            |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------- |
| `WEB_URL_WORKSPACE_INVITE`   | `http://localhost:3000/workspaces/invite?token={{token}}` | ссылка из письма; `{{token}}` — токен |
| `WORKSPACE_INVITE_TTL_HOURS` | `168`                                                     | срок приглашения, часов               |

TTL кэша ролей — 30 с (константа модуля).

---

## Как выразить «проект» ml-labeling-api на этом модуле

В ml-labeling проект одновременно и единица данных, и единица доступа
(`ProjectMember`, `ProjectAccessService`, роли owner/editor/viewer). На шаблоне эти
роли разделяются:

1. **Проект = пространство.** Доступ, участники, приглашения и комнаты сокета — из
   этого модуля. `ProjectMember`, `ProjectAccessService` и `ProjectRoles` не нужны.
   Роли переносятся как есть: `owner → owner`, `editor → editor`, `viewer → viewer`;
   `admin` — новая промежуточная роль (участники и настройки без удаления проекта).
2. **Данные проекта** (изображения, классы, разметка, датасеты, модели) — в доменном
   модуле `project` (или нескольких), сущности с колонкой `workspace_id` →
   `workspaces` ON DELETE CASCADE. Настройки проекта (тип задачи, классы) — сущность
   `ProjectSettings` 1:1 с `Workspace` в модуле `project`, а не колонки в `workspaces`.
3. **Маршруты** — с id пространства в пути и декоратором:
   `@Route("api/v1/projects")` + `@WorkspaceRole("editor", { param: "projectId" })` на
   `@Post("{projectId}/images")`; чтение — `viewer`, удаление проекта — через
   `DELETE /api/v1/workspaces/{id}` (owner) или свой маршрут, вызывающий
   `WorkspaceService.delete`.
4. **Право `project:*`** из ml-labeling («видеть любой проект без членства») —
   это суперпользователь шаблона (роль `admin` или `*`). Если нужен именно доменный
   wildcard, его проверяет модуль `project` до вызова `require`.
5. **Право `project:create`** — `@Security("jwt", ["permission:project:create"])` на
   своём маршруте создания, который вызывает `WorkspaceService.create` и создаёт
   `ProjectSettings` в ответ на `WorkspaceMemberAddedEvent` с ролью owner или в той же
   операции.
6. **Удаление данных проекта** — каскадом БД; файлы в хранилище — слушатель
   `WorkspaceDeletedEvent` в модуле `project` (`FileStorage.deletePrefix("projects/<id>/")`).
7. **Обучение и прочие долгие задачи** — `scope: { type: "workspace", id: projectId }`:
   видимость и отмена задач для участников проекта даёт `WorkspaceJobAccessPolicy`.
8. **Кэш ролей** ml-labeling живёт в памяти процесса и не инвалидируется между
   репликами; здесь кэш в Redis с явной инвалидацией — переносить не нужно.

---

## Тесты

- `workspace-access.service.test.ts` — require/roleOf, 404 vs 403, суперпользователь, кэш.
- `workspace-role.cache.test.ts` — память, TTL, Redis, отказ Redis.
- `workspace-role.decorator.test.ts` — middleware и `getWorkspaceMember`.
- `workspace.service.test.ts` — создание, slug, удаление, архив, передача владения, удаление пользователя.
- `workspace-member.service.test.ts` — роли, удаление, выход.
- `workspace-invite.service.test.ts` — хеш токена, письмо в транзакции, принятие и отказы.
- `workspace.listener.test.ts`, `workspace.policies.test.ts`, `validation/workspace.validation.test.ts`.
