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
├── profile.types.ts                  # Перечисления (EProfileStatus)
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
│   └── index.ts                      # Реэкспорт валидаций
├── profile.service.test.ts           # Тесты ProfileService
├── privacy-settings.service.test.ts  # Тесты PrivacySettingsService
└── index.ts                          # Публичный API модуля
```

## Entities

### Profile (таблица `profiles`)

Личные данные и статус присутствия пользователя.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор профиля |
| `userId` | `uuid` (unique) | ID связанного пользователя |
| `firstName` | `varchar(40)`, nullable | Имя |
| `lastName` | `varchar(40)`, nullable | Фамилия |
| `birthDate` | `date`, nullable | Дата рождения |
| `gender` | `varchar(20)`, nullable | Пол (свободная форма) |
| `status` | `enum('online','offline')`, default `'offline'` | Текущий статус присутствия |
| `lastOnline` | `timestamp`, nullable | Время последнего онлайна |
| `createdAt` | `timestamp` | Дата создания |
| `updatedAt` | `timestamp` | Дата обновления |

**Индексы:**
- `IDX_PROFILES_USER_ID` — уникальный индекс по `userId`
- `IDX_PROFILES_LAST_ONLINE` — индекс по `lastOnline`

**Связи:**
- `OneToOne` -> `User` (через `user_id`, `onDelete: CASCADE`)
- `ManyToOne` -> `File` (через `avatar_id`, `onDelete: SET NULL`) — аватар профиля

### PrivacySettings (таблица `privacy_settings`)

Настройки видимости персональных данных пользователя.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Уникальный идентификатор |
| `userId` | `uuid` (unique) | ID пользователя |
| `showLastOnline` | `enum(EPrivacyLevel)`, default `EVERYONE` | Кто видит время последнего онлайна |
| `showPhone` | `enum(EPrivacyLevel)`, default `CONTACTS` | Кто видит телефон |
| `showAvatar` | `enum(EPrivacyLevel)`, default `EVERYONE` | Кто видит аватар |
| `createdAt` | `timestamp` | Дата создания |
| `updatedAt` | `timestamp` | Дата обновления |

**Индексы:**
- `IDX_PRIVACY_USER` — уникальный индекс по `userId`

**Связи:**
- `OneToOne` -> `User` (через `user_id`, `onDelete: CASCADE`)

## Endpoints

Базовый путь: `/api/profile`

### Профиль текущего пользователя

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/profile/my` | `@Security("jwt")` | Получить профиль текущего пользователя. Возвращает `ProfileDto`. |
| `PATCH` | `/api/profile/my/update` | `@Security("jwt")` | Обновить профиль. Принимает `IProfileUpdateRequestDto`. |
| `DELETE` | `/api/profile/my/delete` | `@Security("jwt")` | Удалить профиль текущего пользователя. |

### Настройки приватности

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/profile/my/privacy` | `@Security("jwt")` | Получить настройки приватности. Автосоздание при отсутствии. |
| `PATCH` | `/api/profile/my/privacy` | `@Security("jwt")` + `@ValidateBody(UpdatePrivacySchema)` | Обновить настройки приватности. |

### Администрирование

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/profile/all` | `@Security("jwt", ["permission:profile:view"])` | Все профили с пагинацией (`offset`, `limit`). |
| `GET` | `/api/profile/{userId}` | `@Security("jwt")` | Публичный профиль пользователя по `userId`. |
| `PATCH` | `/api/profile/update/{userId}` | `@Security("jwt", ["permission:profile:manage"])` | Обновить профиль другого пользователя. |
| `DELETE` | `/api/profile/delete/{userId}` | `@Security("jwt", ["permission:profile:manage"])` | Удалить профиль другого пользователя. |

## Сервисы

### ProfileService

| Метод | Описание |
|-------|----------|
| `getProfiles(offset?, limit?)` | Список профилей с пагинацией. Сортировка `createdAt DESC`. Подгружает `user`. |
| `getProfileByAttr(where)` | Поиск по произвольным условиям. Бросает `NotFoundException`. |
| `getProfileByUserId(userId)` | Профиль по `userId`. Бросает `NotFoundException`. |
| `updateProfile(userId, body)` | Обновление профиля. Эмитит `ProfileUpdatedEvent`. |
| `deleteProfile(userId)` | Удаление профиля. Бросает `NotFoundException`. |

### PrivacySettingsService

| Метод | Описание |
|-------|----------|
| `getSettings(userId)` | Получить настройки. Автосоздание при отсутствии. |
| `updateSettings(userId, data)` | Обновить настройки. Эмитит `PrivacySettingsUpdatedEvent`. |
| `canSeeField(viewerUserId, targetUserId, field)` | Проверка видимости поля: `EVERYONE` -> true, `NOBODY` -> false, `CONTACTS` -> проверка статуса контакта `ACCEPTED`. |

## DTO

- **ProfileDto** — полное представление (id, userId, firstName, lastName, birthDate, gender, status, lastOnline, avatar, user)
- **PublicProfileDto** — ограниченное (id, firstName, lastName, status, lastOnline)
- **IProfileListDto** — пагинированный список `PublicProfileDto[]`
- **IProfileUpdateRequestDto** — данные обновления (firstName?, lastName?, birthDate?, gender?, status?)
- **PrivacySettingsDto** — настройки приватности (showLastOnline, showPhone, showAvatar)

## События (Events)

| Событие | Данные | Когда |
|---------|--------|-------|
| `ProfileUpdatedEvent` | `PublicProfileDto` | При обновлении профиля |
| `PrivacySettingsUpdatedEvent` | `userId: string` | При обновлении настроек приватности |

## Socket-интеграция

### ProfileHandler (ISocketHandler)

| Событие (входящее) | Описание |
|--------------------|----------|
| `profile:subscribe` | Клиент подписывается на комнату `"profile"` |

### ProfileListener (ISocketEventListener)

| Событие EventBus | Socket-событие | Комната/Получатель | Данные |
|------------------|----------------|---------------------|--------|
| `ProfileUpdatedEvent` | `profile:updated` | комната `"profile"` | `PublicProfileDto` |
| `PrivacySettingsUpdatedEvent` | `profile:privacy-changed` | пользователь `userId` | `{}` |

## Зависимости

| Зависимость | Откуда | Использование |
|-------------|--------|---------------|
| `User` entity | `modules/user` | Связь `OneToOne` в `Profile` |
| `File` entity | `modules/file` | Связь `ManyToOne` (аватар) |
| `ContactRepository` | `modules/contact` | `PrivacySettingsService.canSeeField()` — проверка статуса контакта |
| `EventBus` | `core` | Публикация и подписка на доменные события |
| `SocketEmitterService` | `modules/socket` | Отправка событий через socket |
| `SOCKET_HANDLER`, `SOCKET_EVENT_LISTENER` | `modules/socket` | Регистрация handler и listener |

## Перечисления

```typescript
enum EProfileStatus { Online = "online", Offline = "offline" }
enum EPrivacyLevel { EVERYONE = "everyone", CONTACTS = "contacts", NOBODY = "nobody" }
```
