---
name: project_example
description: Ветка example/workspaces — модуль workspace поверх main (multi-tenancy): модель доступа, роли, приглашения, кэш ролей, комнаты/задачи, конфиг, письмо, миграция, e2e, gotcha
type: project
---

Ветка `example/workspaces` = `main` + модуль `src/modules/workspace/` (рабочие пространства).
Подробности модуля (эндпоинты, ошибки, события, тесты) — `src/modules/workspace/README.md`; здесь — выжимка
и неочевидное. Общий код правится в `main` и вливается сюда (`git merge main`); в ветке меняется только
код модуля workspace, его миграция, шаблон письма и e2e-блок.

## Подключение к main (точки расширения)

| Что                | Где / как                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Регистрация модуля | `src/app.module.ts` — `WorkspaceModule` в блоке «Модули проекта», до `SocketModule` (он последний)                                                                                                                                                                                                                                                                 |
| Сущности           | `Workspace` (`workspaces`), `WorkspaceMember` (`workspace_members`), `WorkspaceInvite` (`workspace_invites`)                                                                                                                                                                                                                                                       |
| Миграция           | своя миграция поверх базовой `1790353961289-InitialSchema` (базовую не пересоздавать), класс — в `src/migrations/index.ts`                                                                                                                                                                                                                                         |
| Конфиг             | `workspace.config.ts` — `defineModuleConfig("workspace", …)`: `inviteWebUrl` ← `WEB_URL_WORKSPACE_INVITE`, `inviteTtlHours` ← `WORKSPACE_INVITE_TTL_HOURS` (168)                                                                                                                                                                                                   |
| Env                | `.env.example`, секция «Рабочие пространства»: `WEB_URL_WORKSPACE_INVITE=http://localhost:3000/workspaces/invite?token={{token}}`, `WORKSPACE_INVITE_TTL_HOURS=168`                                                                                                                                                                                                |
| Письмо             | `workspace-invite.mail.ts`: `declare module "../mailer/mailer.types"` дополняет `IMailTemplateData["workspace-invite"] { workspaceName, role, inviteLink }`; файлы `templates/mail/{ru,en}/workspace-invite{.ejs,.txt.ejs,.subject.ejs}` (тест полноты требует во всех локалях)                                                                                    |
| Права              | `workspace.permissions.ts` — `definePermissions("workspace", { key: "workspace", label: "Рабочие пространства" }, { MANAGE: { name: "workspace:manage", label } })`, экспорт из `index.ts` (регистрация — при импорте). **Нигде не проверяется** — задел; при появлении проверки — разбить на действия (в main `manage` разбит миграцией `SplitManagePermissions`) |
| Сокет-события      | `workspace.socket-events.ts` → `declare module "../socket/socket.types"` (`ISocketEmitEvents`): `workspace:member-added`, `workspace:member-removed`, `workspace:member-role-changed`, `workspace:deleted`; экспорт из `index.ts`                                                                                                                                  |
| Комнаты            | `asSocketRoomProvider(WorkspaceRoomProvider)` — при подключении сокет входит в `workspace_<id>` всех своих пространств; `asSocketRoomPolicy(WorkspaceRoomPolicy)` — `room:subscribe { type: "workspace", id }` только участнику (`isMember`)                                                                                                                       |
| Задачи             | `asJobAccessPolicy(WorkspaceJobAccessPolicy)`, `scopeType = "workspace"`: view — любой участник (viewer+), cancel — editor+; постановка `jobs.enqueue(queue, data, { scope: { type: "workspace", id }, ownerId, title })`                                                                                                                                          |
| Слушатель          | `asSocketListener(WorkspaceListener)`: события → сокет + `UserDeletedEvent` → `WorkspaceService.handleUserDeleted()`                                                                                                                                                                                                                                               |

Эндпоинтов 14 (тег Workspace), все `@Security("jwt")`, префикс `api/v1/workspaces`; два контроллера —
`workspace.controller.ts` (пространства, участники) и `workspace-invite.controller.ts` (приглашения,
`POST /invites/accept`). Списки — `IPaginatedDto` (`normalizePagination`).

## Модель доступа

- Роли `WorkspaceRoles` (`workspace.types.ts`): `owner ⊃ admin ⊃ editor ⊃ viewer`, ранги 4..1,
  `workspaceRoleCovers(role, required)`. Набор закрыт. owner ровно один, назначается только передачей
  владения (`TAssignableWorkspaceRole` = admin | editor | viewer).
- Роль в пространстве — не глобальное право: проверка `WorkspaceAccessService.require(actor, workspaceId, minRole)`
  → `IWorkspaceMembership { workspaceId, userId, role, viaSuperuser }`.
  - не участник и несуществующее пространство неразличимы → `WORKSPACE_NOT_FOUND` 404; роли мало →
    `WORKSPACE_FORBIDDEN` 403;
  - `actor` — `AuthContext` или голый `userId`. Суперпользователь (`isSuperUserGrant`: роль `admin` или `*`)
    проходит как owner с `viaSuperuser: true` **только при `AuthContext`**; проверки по `userId` (сокет-комнаты,
    политика задач) его не учитывают.
  - `roleOf(userId, id)`, `isMember(userId, id)`, `invalidate(workspaceId, userIds)` — вызывать после каждого
    изменения членства (после коммита).
- Декоратор маршрута `@WorkspaceRole(minRole, { param = "workspaceId" })` (`workspace-role.decorator.ts`) —
  tsoa `Middlewares`, ставится с `@Security("jwt")`; сервис берёт из `iocContainer` (`src/app.container`,
  middleware tsoa создаётся без DI), членство кладёт в `ctx.state.workspaceMember`, в контроллере —
  `getWorkspaceMember(req)` (без декоратора — 500). Готов для доменных модулей, **контроллерами самого workspace
  не используется** (они вызывают `require` в сервисах).
- Кэш роли `WorkspaceRoleCache`: Redis `workspace:role:<ws>:<user>` `EX 30` (`WORKSPACE_ROLE_CACHE_TTL_SECONDS`),
  без Redis — память процесса (уборка после 10 000 записей). Кэшируется и «не участник» (маркер `-`).
  Сбой Redis — кэш пропускается, роль из БД (лог warn).

## Правила

- Создание — транзакция: пространство + участник-owner; без `slug` генерируется (`[a-z0-9-]`, 3..64, без дефиса
  по краям, unique → `WORKSPACE_SLUG_TAKEN` 409). `archivedAt` — только скрывает из «моих», доступ не меняет.
- Смена роли/удаление участника — admin+; не выше своей роли (`WORKSPACE_ROLE_TOO_HIGH`), owner и старших не
  трогать (`WORKSPACE_CANNOT_MANAGE_MEMBER`), owner — только передачей (`WORKSPACE_OWNER_ROLE_VIA_TRANSFER`).
- Передача владения — `FOR UPDATE` строки пространства (двух владельцев не будет); прежний owner → admin;
  себе — `WORKSPACE_TRANSFER_TO_SELF`. Владелец не выходит (`WORKSPACE_OWNER_CANNOT_LEAVE`).
- `workspaces.ownerId` дублирует участника-owner, FK `SET NULL` (владелец удалён → `null`).
- Приглашение: токен 32 байта base64url, в БД только sha256 (`tokenHash` unique), в DTO токена нет; новое на
  тот же email отзывает прежнее действующее; уже участник → `WORKSPACE_ALREADY_MEMBER`. Письмо ставится в
  `mail.send` **в той же транзакции** (outbox, `MailerService.send(…, { manager })`); ссылка —
  `inviteWebUrl` с `{{token}}` (`encodeURIComponent`). В production без SMTP — `MAIL_NOT_CONFIGURED` 503.
- Принятие: email приглашения = **подтверждённый** email пользователя (без регистра), иначе
  `WORKSPACE_INVITE_EMAIL_MISMATCH` 403; гашение — атомарный условный `UPDATE` → повтор/гонка
  `WORKSPACE_INVITE_ALREADY_USED` 409; просрочено — `WORKSPACE_INVITE_EXPIRED` 410; уже участник — роль не
  меняется. Статус приглашения (`pending|accepted|revoked|expired`) вычисляется из дат. Повторный отзыв — без
  ошибки, отзыв принятого — 409.
- `UserDeletedEvent` приходит **после** удаления: членства уже сняты каскадом, `ownerId` → NULL. Очистка
  (`handleUserDeleted`) ищет «сирот» (пространства без участников → удалить) и пространства без owner (владение
  старейшему admin, иначе старейшему участнику); идемпотентна, подбирает хвосты прошлых сбоев, ошибки изолированы
  по пространствам.
- Сокет (`WorkspaceListener`): MemberAdded → `joinRoom` + `workspace:member-added` в комнату; MemberRemoved →
  `leaveRoom` + `workspace:member-removed` в комнату и самому; RoleChanged → в комнату; Deleted →
  `workspace:deleted` каждому участнику + `leaveRoom`.

## Тесты

- Юнит: `workspace-access.service`, `workspace-role.cache`, `workspace-role.decorator`, `workspace.service`,
  `workspace-member.service`, `workspace-invite.service`, `workspace.listener`, `workspace.policies`,
  `validation/workspace.validation` (`*.test.ts`). Двойники транзакций — `createMockEntityManager` /
  `createMockDataSource` (`src/test/helpers.ts`).
- E2E — блок «рабочие пространства» в `test/e2e/platform.e2e.ts` (один сценарий): создание → чужой видит 404 →
  подтверждение email через Mailpit → приглашение, ссылка с `token=` из письма → принятие неподтверждённым
  (`WORKSPACE_INVITE_EMAIL_MISMATCH`) и подтверждённым → viewer не может PATCH (403) → смена роли на admin →
  второе приглашение и отзыв (204), в DTO нет `token` → передача владения → прежний владелец выходит и видит 404 →
  новый владелец приглашает, удаляет участника, удаляет пространство (204). Все 14 эндпоинтов должны вызываться
  (`zz-coverage.e2e.ts`).

## Перенос «проекта» ml-labeling-api (из README модуля)

Проект = пространство (доступ, участники, приглашения, комнаты); `ProjectMember`/`ProjectAccessService` не нужны,
роли `owner/editor/viewer` как есть + новая `admin`. Данные — доменный модуль `project` с `workspace_id` →
`workspaces` ON DELETE CASCADE, настройки — `ProjectSettings` 1:1. Маршруты — `@WorkspaceRole("editor",
{ param: "projectId" })`. Право `project:*` = суперпользователь шаблона. Файлы при удалении — слушатель
`WorkspaceDeletedEvent` → `FileStorage.deletePrefix("projects/<id>/")`. Долгие задачи — `scope: { type:
"workspace", id }`. Кэш ролей ml-labeling (память без инвалидации) не переносить.

## Gotcha

- `WORKSPACE_INVITE_TTL_MS` считается из `workspaceConfig` при импорте `workspace.types.ts` — конфиг модуля
  парсится при загрузке (ошибка env → падение с «Конфигурация модуля «workspace»: …»).
- Суперпользователь не попадает в комнаты/задачи пространства без членства (проверки по `userId`).
- `workspace:manage` объявлено, но ни одним маршрутом не требуется. Области «все / свои» (`OwnedAccess`) модулю не нужны:
  доступ — по членству и роли участника, а не по владельцу.
- Вливание main: `routes.ts`/`swagger.json` при конфликте — любая сторона + `yarn generate`; `migrations/index.ts` —
  объединить по timestamp.
- После изменения членства без `invalidate` старая роль живёт до 30 с на всех репликах.
