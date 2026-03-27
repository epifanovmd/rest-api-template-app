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
| `birthDate` | `timestamp`, nullable | Дата рождения |
| `gender` | `varchar(20)`, nullable | Пол (свободная форма) |
| `status` | `enum('online','offline')`, default `'offline'` | Текущий статус присутствия |
| `lastOnline` | `timestamp`, nullable | Время последнего онлайна |
| `createdAt` | `timestamp` | Дата создания |
| `updatedAt` | `timestamp` | Дата обновления |

**Индексы:**
- `IDX_PROFILES_USER_ID` — уникальный индекс по `userId`
- `IDX_PROFILES_LAST_ONLINE` — индекс по `lastOnline`

**Связи:**
- `OneToOne` -> `User` (через `user_id`, `onDelete: CASCADE`) — каждый профиль принадлежит одному пользователю
- `ManyToOne` -> `File` (через `avatar_id`, `onDelete: SET NULL`) — аватар профиля (ссылка на файл)

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

**Перечисление `EPrivacyLevel`:**
- `EVERYONE` — видно всем
- `CONTACTS` — видно только контактам (со статусом `ACCEPTED`)
- `NOBODY` — скрыто от всех

**Индексы:**
- `IDX_PRIVACY_USER` — уникальный индекс по `userId`

**Связи:**
- `OneToOne` -> `User` (через `user_id`, `onDelete: CASCADE`)

## Endpoints

Базовый путь: `/api/profile`

### Профиль текущего пользователя

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/profile/my` | `@Security("jwt")` | Получить профиль текущего пользователя. Возвращает `ProfileDto` с полной информацией включая данные `User`. |
| `PATCH` | `/api/profile/my/update` | `@Security("jwt")` | Обновить профиль текущего пользователя. Принимает `IProfileUpdateRequestDto`. Возвращает обновленный `ProfileDto`. |
| `DELETE` | `/api/profile/my/delete` | `@Security("jwt")` | Удалить профиль текущего пользователя. Возвращает `userId`. |

### Настройки приватности

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/profile/my/privacy` | `@Security("jwt")` | Получить настройки приватности текущего пользователя. Возвращает `PrivacySettingsDto`. Если настройки не существуют — создаются автоматически с дефолтными значениями. |
| `PATCH` | `/api/profile/my/privacy` | `@Security("jwt")` + `@ValidateBody(UpdatePrivacySchema)` | Обновить настройки приватности. Принимает опциональные поля `showLastOnline`, `showPhone`, `showAvatar` (значения `EPrivacyLevel`). Валидация через Zod-схему. |

### Администрирование

| Метод | Путь | Security | Описание |
|-------|------|----------|----------|
| `GET` | `/api/profile/all` | `@Security("jwt", ["role:admin"])` | Получить все профили с пагинацией. Query-параметры: `offset`, `limit`. Возвращает `IProfileListDto` с массивом `PublicProfileDto`. |
| `GET` | `/api/profile/{userId}` | `@Security("jwt")` | Получить публичный профиль пользователя по его `userId`. Возвращает `PublicProfileDto` (ограниченный набор полей). |
| `PATCH` | `/api/profile/update/{userId}` | `@Security("jwt", ["role:admin"])` | Обновить профиль другого пользователя. Принимает `IProfileUpdateRequestDto`. |
| `DELETE` | `/api/profile/delete/{userId}` | `@Security("jwt", ["role:admin"])` | Удалить профиль другого пользователя. |

## Сервисы

### ProfileService

Управление профилями пользователей. Инжектирует `ProfileRepository`.

| Метод | Описание |
|-------|----------|
| `getProfiles(offset?, limit?)` | Получить список всех профилей с пагинацией. Сортировка по `createdAt DESC`. Использует `QueryBuilder` с `leftJoinAndSelect` для подгрузки `user`. Возвращает `[Profile[], count]`. |
| `getProfileByAttr(where)` | Найти профиль по произвольным условиям `FindOptionsWhere<Profile>`. Выбрасывает `NotFoundException` если не найден. |
| `getProfileByUserId(userId)` | Получить профиль по `userId`. Выбрасывает `NotFoundException` если не найден. |
| `updateProfile(userId, body)` | Обновить данные профиля. Сначала выполняет `update`, затем загружает и возвращает обновленный профиль. |
| `deleteProfile(userId)` | Удалить профиль. Выбрасывает `NotFoundException` если профиль не существует. Возвращает `userId`. |

### PrivacySettingsService

Управление настройками приватности. Инжектирует `PrivacySettingsRepository` и `ContactRepository` (из модуля Contact).

| Метод | Описание |
|-------|----------|
| `getSettings(userId)` | Получить настройки приватности. Если записи нет — автоматически создает с дефолтными значениями. |
| `updateSettings(userId, data)` | Обновить настройки приватности. Обновляет только переданные поля. Если записи нет — создает новую с переданными данными. |
| `canSeeField(viewerUserId, targetUserId, field)` | Проверить, может ли `viewer` видеть конкретное поле `target`-пользователя. Логика: если `viewer === target` -> `true`; если уровень `EVERYONE` -> `true`; если `NOBODY` -> `false`; если `CONTACTS` -> проверяет наличие контакта со статусом `ACCEPTED` через `ContactRepository`. |

## DTO

### ProfileDto

Полное представление профиля (для владельца). Включает все поля entity + вложенный `UserDto`.

| Поле | Тип |
|------|-----|
| `id` | `string` |
| `userId` | `string` |
| `firstName` | `string?` |
| `lastName` | `string?` |
| `birthDate` | `Date?` |
| `gender` | `string?` |
| `status` | `string?` |
| `lastOnline` | `Date?` |
| `createdAt` | `Date` |
| `updatedAt` | `Date` |
| `user` | `UserDto?` |

### PublicProfileDto

Ограниченное представление профиля (для просмотра другими пользователями). Не содержит `userId`, `gender`, `birthDate`, связанного `user`.

| Поле | Тип |
|------|-----|
| `id` | `string` |
| `firstName` | `string?` |
| `lastName` | `string?` |
| `status` | `EProfileStatus` |
| `lastOnline` | `Date?` |

### IProfileListDto

Обертка для списка профилей с пагинацией. Расширяет `IListResponseDto<PublicProfileDto[]>`.

| Поле | Тип |
|------|-----|
| `offset` | `number?` |
| `limit` | `number?` |
| `count` | `number` |
| `totalCount` | `number` |
| `data` | `PublicProfileDto[]` |

### IProfileUpdateRequestDto

Данные для обновления профиля. Все поля опциональные.

| Поле | Тип |
|------|-----|
| `firstName` | `string?` |
| `lastName` | `string?` |
| `bio` | `string?` |
| `birthDate` | `Date?` |
| `gender` | `string?` |
| `status` | `EProfileStatus?` |

### PrivacySettingsDto

Представление настроек приватности.

| Поле | Тип |
|------|-----|
| `showLastOnline` | `EPrivacyLevel` |
| `showPhone` | `EPrivacyLevel` |
| `showAvatar` | `EPrivacyLevel` |

## Валидация

### UpdatePrivacySchema (Zod)

Схема валидации для обновления настроек приватности. Все поля опциональные, значения ограничены перечислением `EPrivacyLevel` (`everyone`, `contacts`, `nobody`).

```typescript
z.object({
  showLastOnline: z.nativeEnum(EPrivacyLevel).optional(),
  showPhone: z.nativeEnum(EPrivacyLevel).optional(),
  showAvatar: z.nativeEnum(EPrivacyLevel).optional(),
});
```

## События (Events)

### ProfileUpdatedEvent

Доменное событие, публикуемое при обновлении профиля.

| Поле | Тип | Описание |
|------|-----|----------|
| `profile` | `PublicProfileDto` | Публичные данные обновленного профиля |

## Socket-интеграция

### ProfileHandler (ISocketHandler)

Обрабатывает socket-подключения клиентов.

| Событие (входящее) | Описание |
|--------------------|----------|
| `profile:subscribe` | Клиент подписывается на обновления профилей. Socket присоединяется к комнате `"profile"`. |

### ProfileListener (ISocketEventListener)

Слушает события `EventBus` и транслирует их в socket-комнаты.

| Событие EventBus | Socket-событие (исходящее) | Комната | Данные |
|------------------|---------------------------|---------|--------|
| `ProfileUpdatedEvent` | `profile:updated` | `"profile"` | `PublicProfileDto` |

**Поток данных:**
1. Бизнес-логика публикует `ProfileUpdatedEvent` через `EventBus`
2. `ProfileListener` перехватывает событие
3. Через `SocketEmitterService` отправляет данные в комнату `"profile"` всем подписанным клиентам

## Перечисления

### EProfileStatus

```typescript
enum EProfileStatus {
  Online = "online",
  Offline = "offline",
}
```

### EPrivacyLevel

```typescript
enum EPrivacyLevel {
  EVERYONE = "everyone",
  CONTACTS = "contacts",
  NOBODY = "nobody",
}
```

## Зависимости

### Импорты модулей и внешних сервисов

| Зависимость | Откуда | Где используется |
|-------------|--------|------------------|
| `User` entity | `modules/user` | Связь `OneToOne` в `Profile` entity |
| `File` entity | `modules/file` | Связь `ManyToOne` (аватар) в `Profile` entity |
| `ContactRepository` | `modules/contact` | `PrivacySettingsService.canSeeField()` — проверка статуса контакта при уровне приватности `CONTACTS` |
| `EventBus` | `core` | `ProfileListener` — подписка на доменные события |
| `SocketEmitterService` | `modules/socket` | `ProfileListener` — отправка событий в socket-комнаты |
| `SOCKET_EVENT_LISTENER` | `modules/socket` | Регистрация `ProfileListener` как слушателя socket-событий |
| `SOCKET_HANDLER` | `modules/socket` | Регистрация `ProfileHandler` как обработчика socket-подключений |
| `BaseRepository`, `InjectableRepository` | `core` | Базовый класс для репозиториев |
| `Injectable`, `ValidateBody`, `getContextUser` | `core` | DI-маркер, валидация тела запроса, получение текущего пользователя из контекста |
| `BaseDto` | `core/dto` | Базовый класс для DTO |
| `UserDto` | `modules/user/dto` | Вложен в `ProfileDto` |

## Взаимодействие с другими модулями

### Profile -> User
- Entity `Profile` имеет связь `OneToOne` с `User` (`onDelete: CASCADE` — при удалении пользователя профиль удаляется автоматически)
- `ProfileDto` содержит вложенный `UserDto` для полного представления

### Profile -> File
- Entity `Profile` имеет связь `ManyToOne` с `File` через поле `avatar` (`onDelete: SET NULL` — при удалении файла аватар обнуляется)

### Profile -> Contact
- `PrivacySettingsService` использует `ContactRepository` для проверки, являются ли два пользователя контактами (при уровне приватности `CONTACTS`)
- Проверяется именно статус `ACCEPTED` — запросы в ожидании (`PENDING`) или заблокированные (`BLOCKED`) контакты не дают доступа

### Profile -> Socket
- Модуль регистрирует `ProfileHandler` и `ProfileListener` через токены `SOCKET_HANDLER` и `SOCKET_EVENT_LISTENER`
- Клиенты подписываются на обновления через событие `profile:subscribe`
- Обновления профилей транслируются в реальном времени через socket-событие `profile:updated`

## Тесты

Модуль содержит юнит-тесты для обоих сервисов:

- **`profile.service.test.ts`** — тесты `ProfileService`: пагинация, поиск по атрибутам, поиск по `userId`, обновление, удаление, обработка `NotFoundException`
- **`privacy-settings.service.test.ts`** — тесты `PrivacySettingsService`: получение/автосоздание настроек, обновление отдельных и множественных полей, логика `canSeeField` для всех уровней приватности и статусов контактов
