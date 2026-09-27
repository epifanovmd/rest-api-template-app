# Модуль Profile

Модуль управления профилями пользователей и настройками приватности. Предоставляет CRUD-операции для профилей, управление статусом присутствия (online/offline), а также гранулярные настройки видимости персональных данных (последний онлайн, телефон, аватар).

## Структура файлов

```
src/modules/profile/
├── profile.module.ts                 # Объявление модуля (@Module)
├── profile.entity.ts                 # Entity профиля (таблица profiles)
├── privacy-settings.entity.ts        # Entity настроек приватности (таблица privacy_settings)
├── profile.repository.ts             # Репозиторий профилей
├── privacy-settings.repository.ts    # Репозиторий настроек приватности
├── profile.service.ts                # Сервис управления профилями
├── privacy-settings.service.ts       # Сервис управления настройками приватности
├── profile.controller.ts             # REST-контроллер (tsoa)
├── profile.errors.ts                 # ProfileError — коды PROFILE_*
├── profile.permissions.ts            # ProfilePermissions (definePermissions("profile"))
├── profile.handler.ts                # Socket-обработчик (подписка клиентов на комнату)
├── profile.listener.ts               # Слушатель событий EventBus -> Socket
├── dto/
│   ├── profile.dto.ts                # ProfileDto, PublicProfileDto, IProfileListDto
│   ├── profile-update-request.dto.ts # IProfileUpdateRequestDto
│   ├── privacy-settings.dto.ts       # PrivacySettingsDto
│   └── index.ts                      # Реэкспорт DTO
├── events/
│   ├── profile-updated.event.ts      # Событие ProfileUpdatedEvent
│   ├── privacy-settings-updated.event.ts # Событие PrivacySettingsUpdatedEvent
│   └── index.ts                      # Реэкспорт событий
├── validation/
│   ├── update-privacy.validate.ts    # Zod-схема UpdatePrivacySchema
│   ├── update-profile.validate.ts    # Zod-схема UpdateProfileSchema
│   ├── profile-list-query.validate.ts # Zod-схема ProfileListQuerySchema (limit/offset)
│   └── index.ts                      # Реэкспорт валидаций
├── profile.service.test.ts           # Тесты ProfileService
├── privacy-settings.service.test.ts  # Тесты PrivacySettingsService
└── index.ts                          # Публичный API модуля
```

## Entities

### Profile (таблица `profiles`)

Личные данные и статус присутствия пользователя.

| Поле         | Тип                                             | Описание                                       |
| ------------ | ----------------------------------------------- | ---------------------------------------------- |
| `id`         | `uuid` (PK)                                     | Уникальный идентификатор профиля               |
| `userId`     | `uuid` (unique)                                 | ID связанного пользователя                     |
| `firstName`  | `varchar(40)`, nullable                         | Имя                                            |
| `lastName`   | `varchar(40)`, nullable                         | Фамилия                                        |
| `birthDate`  | `date`, nullable                                | Дата рождения                                  |
| `gender`     | `varchar(20)`, nullable                         | Пол (свободная форма)                          |
| `locale`     | `varchar(10)`, nullable, default `NULL`         | Язык пользователя (`ru`, `en-US`) — язык писем |
| `status`     | `enum('online','offline')`, default `'offline'` | Текущий статус присутствия                     |
| `lastOnline` | `timestamp`, nullable                           | Время последнего онлайна                       |
| `createdAt`  | `timestamp`                                     | Дата создания                                  |
| `updatedAt`  | `timestamp`                                     | Дата обновления                                |

**Индексы:**

- `IDX_PROFILES_USER_ID` — уникальный индекс по `userId`
- `IDX_PROFILES_LAST_ONLINE` — индекс по `lastOnline`

**Связи:**

- `OneToOne` -> `User` (через `user_id`, `onDelete: CASCADE`)
- `ManyToOne` -> `File` (через `avatar_id`, `onDelete: SET NULL`) — аватар профиля

### PrivacySettings (таблица `privacy_settings`)

Настройки видимости персональных данных пользователя.

| Поле             | Тип                                       | Описание                           |
| ---------------- | ----------------------------------------- | ---------------------------------- |
| `id`             | `uuid` (PK)                               | Уникальный идентификатор           |
| `userId`         | `uuid` (unique)                           | ID пользователя                    |
| `showLastOnline` | `enum(EPrivacyLevel)`, default `EVERYONE` | Кто видит время последнего онлайна |
| `showPhone`      | `enum(EPrivacyLevel)`, default `CONTACTS` | Кто видит телефон                  |
| `showAvatar`     | `enum(EPrivacyLevel)`, default `EVERYONE` | Кто видит аватар                   |
| `createdAt`      | `timestamp`                               | Дата создания                      |
| `updatedAt`      | `timestamp`                               | Дата обновления                    |

**Индексы:**

- `IDX_PRIVACY_USER` — уникальный индекс по `userId`

**Связи:**

- `OneToOne` -> `User` (через `user_id`, `onDelete: CASCADE`)

## Endpoints

Базовый путь: `/api/v1/profile`

### Профиль текущего пользователя

| Метод    | Путь                     | Security                                                  | Описание                                                                                   |
| -------- | ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET`    | `/api/profile/my`        | `@Security("jwt")`                                        | Получить профиль текущего пользователя. Возвращает `ProfileDto`.                           |
| `PATCH`  | `/api/profile/my/update` | `@Security("jwt")` + `@ValidateBody(UpdateProfileSchema)` | Обновить профиль. Принимает `IProfileUpdateRequestDto`.                                    |
| `DELETE` | `/api/profile/my/delete` | `@Security("jwt")`                                        | Очистить профиль: имя, фамилия, дата рождения, пол, аватар → `null`; запись остаётся. 204. |

### Настройки приватности

| Метод   | Путь                      | Security                                                  | Описание                                                                                                                           |
| ------- | ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/profile/my/privacy` | `@Security("jwt")`                                        | Получить настройки приватности. При отсутствии создаются через `INSERT … ON CONFLICT DO NOTHING` (параллельные запросы не падают). |
| `PATCH` | `/api/profile/my/privacy` | `@Security("jwt")` + `@ValidateBody(UpdatePrivacySchema)` | Обновить настройки приватности.                                                                                                    |

### Администрирование

| Метод    | Путь                           | Security                                                                                   | Описание                                                                                             |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/profile/all`             | `@Security("jwt", ["permission:profile:view"])` + `@ValidateQuery(ProfileListQuerySchema)` | `IProfileListDto` = `IPaginatedDto<PublicProfileDto>`; `limit` по умолчанию 20, ≤ 100; `offset` ≥ 0. |
| `GET`    | `/api/profile/{userId}`        | `@Security("jwt")`                                                                         | Публичный профиль пользователя по `userId`.                                                          |
| `PATCH`  | `/api/profile/update/{userId}` | `@Security("jwt", ["permission:profile:manage"])` + `@ValidateBody(UpdateProfileSchema)`   | Обновить профиль другого пользователя.                                                               |
| `DELETE` | `/api/profile/delete/{userId}` | `@Security("jwt", ["permission:profile:manage"])`                                          | Очистить профиль другого пользователя (запись остаётся). 204.                                        |

`{userId}` — `UUID` (неверный формат → 422).

### Валидация обновления (`UpdateProfileSchema`)

- `firstName`, `lastName` — строка ≤ 40 символов (trim) или `null`;
- `gender` — строка ≤ 20 символов или `null`;
- `locale` — код языка (`ru`, `en`, `en-US`, `pt_BR`), ≤ 10 символов, или `null`.
  Письма отправляются на `ru`/`en` (прочие языки — `ru`), см. модуль mailer;
- `birthDate` — ISO-дата (`YYYY-MM-DD` или date-time), не раньше 1900-01-01 и не в
  будущем, или `null`.

## Сервисы

### ProfileService

| Метод                          | Описание                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `getProfiles(offset?, limit?)` | `IPaginatedDto<PublicProfileDto>` через `normalizePagination`/`toPage`; `createdAt DESC`.                |
| `getProfileByAttr(where)`      | Поиск по произвольным условиям. Нет — `PROFILE_NOT_FOUND` (404).                                         |
| `getProfileByUserId(userId)`   | Профиль по `userId`. Нет — `PROFILE_NOT_FOUND` (404).                                                    |
| `updateProfile(userId, body)`  | Обновление профиля. Эмитит `ProfileUpdatedEvent`.                                                        |
| `deleteProfile(userId)`        | Очистка личных полей профиля (запись остаётся). Эмитит `ProfileUpdatedEvent`. Нет — `PROFILE_NOT_FOUND`. |

### PrivacySettingsService

| Метод                                                   | Описание                                                                                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSettings(userId)`                                   | Настройки пользователя; при отсутствии создаются без гонки (`findOrCreate`, `ON CONFLICT DO NOTHING`).                                                                                                                                  |
| `updateSettings(userId, data)`                          | Обновить настройки. Эмитит `PrivacySettingsUpdatedEvent`.                                                                                                                                                                               |
| `canSeeField(viewerUserId, targetUserId, field)`        | Проверка видимости поля: `EVERYONE` -> true, `NOBODY` -> false, `CONTACTS` -> зритель — контакт по модулям связей (`CONTACT_RELATION`); без них — только сам пользователь. Ничего не пишет в БД: без записи настроек — дефолты колонок. |
| `getVisibleUserIds(viewerUserId, targetUserIds, field)` | Пакетный `canSeeField` (2 запроса на список). Используется модулем user для `PublicUserDto.phone`.                                                                                                                                      |

## DTO

- **ProfileDto** — полное представление (id, userId, firstName, lastName, birthDate, gender, locale, lastOnline, avatar, user); `avatar` — `IFileDto` из карты подписей
- **PublicProfileDto** — ограниченное (id, userId, firstName, lastName, lastOnline, avatarUrl); `avatarUrl` — подписанная ссылка из карты, `null` — аватара нет
- Оба — `fromEntity(profile, files: TSignedFiles)`; файлы — `collectProfileFiles(profiles)`, сборка с подписью — `ProfileService.toProfileDto` / `toPublicProfileDto` (репозиторий грузит `avatar`). `PublicProfileDto` использует `PublicUserDto` и модули, показывающие чужие профили. Настройка `showAvatar` в DTO пока не применяется.
- **IProfileListDto** — `IPaginatedDto<PublicProfileDto>` (`items`, `total`, `offset`, `limit`)
- **IProfileUpdateRequestDto** — данные обновления (firstName?, lastName?, birthDate?, gender?, locale?)
- **PrivacySettingsDto** — настройки приватности (showLastOnline, showPhone, showAvatar)

## Ошибки и права

- `ProfileError.NOT_FOUND` → `PROFILE_NOT_FOUND` (404).
- `ProfilePermissions = definePermissions("profile", { VIEW: "profile:view", MANAGE: "profile:manage" })`.

## События (Events)

| Событие                       | Данные             | Когда                               |
| ----------------------------- | ------------------ | ----------------------------------- |
| `ProfileUpdatedEvent`         | `PublicProfileDto` | При обновлении профиля              |
| `PrivacySettingsUpdatedEvent` | `userId: string`   | При обновлении настроек приватности |

## Socket-интеграция

### ProfileHandler (ISocketHandler)

| Событие (входящее)  | Описание                                    |
| ------------------- | ------------------------------------------- |
| `profile:subscribe` | Клиент подписывается на комнату `"profile"` |

### ProfileListener (ISocketEventListener)

| Событие EventBus              | Socket-событие            | Комната/Получатель    | Данные             |
| ----------------------------- | ------------------------- | --------------------- | ------------------ |
| `ProfileUpdatedEvent`         | `profile:updated`         | комната `"profile"`   | `PublicProfileDto` |
| `PrivacySettingsUpdatedEvent` | `profile:privacy-changed` | пользователь `userId` | `{}`               |

## Зависимости

| Зависимость                               | Откуда           | Использование                             |
| ----------------------------------------- | ---------------- | ----------------------------------------- |
| `User` entity                             | `modules/user`   | Связь `OneToOne` в `Profile`              |
| `File` entity                             | `modules/file`   | Связь `ManyToOne` (аватар)                |
| `EventBus`                                | `core`           | Публикация и подписка на доменные события |
| `SocketEmitterService`                    | `modules/socket` | Отправка событий через socket             |
| `SOCKET_HANDLER`, `SOCKET_EVENT_LISTENER` | `modules/socket` | Регистрация handler и listener            |

## Связи пользователей (`profile.relations.ts`)

Профиль не знает, кто кому контакт и кто чей собеседник, — это знают модули связей и
регистрируют реализации:

| Токен               | Регистрация               | Контракт                                                                                                   | Потребитель                           |
| ------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `CONTACT_RELATION`  | `asContactRelation(Cls)`  | `contactsOf(viewerId, userIds)` — те из `userIds`, у кого зритель в принятых контактах                     | уровень приватности `CONTACTS`        |
| `PRESENCE_AUDIENCE` | `asPresenceAudience(Cls)` | `audience(userId, level)` — кому слать online/offline; `peers(userId)` — чей статус отдать при подключении | `PresenceListener`, `PresenceHandler` |

Результаты всех реализаций объединяются. Без модулей связей `CONTACTS` видит только
сам пользователь, а присутствие никому не рассылается. При `showLastOnline = nobody`
аудитория не запрашивается.

## Перечисления

```typescript
enum EProfileStatus {
  Online = "online",
  Offline = "offline",
}
enum EPrivacyLevel {
  EVERYONE = "everyone",
  CONTACTS = "contacts",
  NOBODY = "nobody",
}
```
