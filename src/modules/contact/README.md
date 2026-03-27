# Модуль Contact

Модуль управления контактами пользователей. Реализует функциональность добавления, принятия, удаления и блокировки контактов с двусторонней связью между пользователями. При добавлении контакта создаются две записи: для инициатора (со статусом `ACCEPTED`) и для получателя (со статусом `PENDING`), что формирует систему запросов на добавление в контакты.

## Структура файлов

```
src/modules/contact/
├── contact.entity.ts                # TypeORM entity — таблица contacts
├── contact.types.ts                 # Enum EContactStatus
├── contact.repository.ts            # Репозиторий с методами поиска
├── contact.service.ts               # Бизнес-логика контактов
├── contact.controller.ts            # REST-контроллер (tsoa)
├── contact.listener.ts              # Socket-слушатель доменных событий
├── contact.module.ts                # Декларация модуля @Module
├── contact.service.test.ts          # Unit-тесты сервиса
├── index.ts                         # Реэкспорт всех публичных символов
├── dto/
│   ├── contact.dto.ts               # DTO контакта + IContactListDto
│   └── index.ts
├── events/
│   ├── contact-request.event.ts     # Событие запроса на добавление
│   ├── contact-accepted.event.ts    # Событие принятия контакта
│   └── index.ts
└── validation/
    ├── create-contact.validate.ts   # Zod-схема CreateContactSchema
    ├── contact.validation.test.ts   # Unit-тесты валидации
    └── index.ts
```

## Entity

### Contact (`contacts`)

| Поле             | Тип                | Описание                           |
|------------------|--------------------|------------------------------------|
| `id`             | `uuid` (PK)       | Первичный ключ                     |
| `userId`         | `uuid`             | ID владельца записи контакта       |
| `contactUserId`  | `uuid`             | ID пользователя-контакта           |
| `displayName`    | `varchar(80)` null | Пользовательское имя контакта      |
| `status`         | `enum`             | Статус: `pending`, `accepted`, `blocked` |
| `createdAt`      | `timestamp`        | Дата создания (автоматически)      |
| `updatedAt`      | `timestamp`        | Дата обновления (автоматически)    |

#### Индексы

- `IDX_CONTACTS_USER_CONTACT` — уникальный индекс по `(userId, contactUserId)`, предотвращает дублирование контактов
- `IDX_CONTACTS_CONTACT_USER` — индекс по `(contactUserId, userId)`, ускоряет обратный поиск

#### Связи

| Связь          | Тип        | Целевая entity | FK             | onDelete |
|----------------|------------|----------------|----------------|----------|
| `user`         | `ManyToOne`| `User`         | `user_id`      | CASCADE  |
| `contactUser`  | `ManyToOne`| `User`         | `contact_user_id` | CASCADE |

#### Статусы (`EContactStatus`)

- `PENDING` — запрос на добавление ожидает подтверждения получателем
- `ACCEPTED` — контакт подтвержден
- `BLOCKED` — контакт заблокирован владельцем записи

## Endpoints

Базовый путь: `api/contact` | Тег Swagger: `Contact`

Все эндпоинты требуют JWT-аутентификации (`@Security("jwt")`). Дополнительных permission не требуется — доступ ограничен только авторизованными пользователями; каждый пользователь работает исключительно со своими контактами.

| Метод    | Путь                    | Описание                                   | Тело запроса / параметры                        | Ответ          |
|----------|-------------------------|--------------------------------------------|-------------------------------------------------|----------------|
| `POST`   | `/api/contact`          | Добавить контакт                           | `{ contactUserId: string, displayName?: string }` | `ContactDto`   |
| `GET`    | `/api/contact`          | Получить список контактов текущего пользователя | Query: `status?` (pending/accepted/blocked)    | `ContactDto[]` |
| `PATCH`  | `/api/contact/{id}/accept` | Принять запрос на добавление в контакты  | Path: `id` (UUID контакта)                      | `ContactDto`   |
| `DELETE` | `/api/contact/{id}`     | Удалить контакт (обе стороны связи)        | Path: `id` (UUID контакта)                      | `string` (id)  |
| `POST`   | `/api/contact/{id}/block` | Заблокировать контакт                    | Path: `id` (UUID контакта)                      | `ContactDto`   |

### Валидация

Эндпоинт `POST /api/contact` использует декоратор `@ValidateBody(CreateContactSchema)` с Zod-схемой:

- `contactUserId` — обязательное поле, валидный UUID
- `displayName` — опциональное, строка до 80 символов

## Сервис (ContactService)

### Зависимости

- `ContactRepository` — доступ к данным контактов
- `EventBus` — публикация доменных событий

### Методы

#### `addContact(userId, contactUserId, displayName?)`

1. Проверяет, что пользователь не добавляет сам себя (`BadRequestException`)
2. Проверяет, не существует ли уже контакт (`ConflictException`) и не заблокирован ли (`ForbiddenException`)
3. Создает две записи:
   - Для инициатора: `status = ACCEPTED`
   - Для получателя: `status = PENDING`
4. Эмитит `ContactRequestEvent` с `targetUserId` получателя
5. Возвращает `ContactDto` инициатора

#### `acceptContact(userId, contactId)`

1. Находит контакт, проверяет принадлежность текущему пользователю (`NotFoundException`)
2. Проверяет, что статус `PENDING` (`BadRequestException`)
3. Меняет статус на `ACCEPTED`
4. Эмитит `ContactAcceptedEvent` с `requesterId` (ID инициатора)
5. Возвращает обновленный `ContactDto`

#### `removeContact(userId, contactId)`

1. Находит контакт, проверяет принадлежность (`NotFoundException`)
2. Удаляет обе стороны связи (запись инициатора и запись получателя)
3. Возвращает `contactId`

#### `blockContact(userId, contactId)`

1. Находит контакт, проверяет принадлежность (`NotFoundException`)
2. Меняет статус на `BLOCKED`
3. Возвращает обновленный `ContactDto`

#### `getContacts(userId, status?)`

1. Загружает все контакты пользователя, опционально фильтруя по статусу
2. Возвращает массив `ContactDto`

## DTO

### ContactDto

| Поле             | Тип                    | Описание                         |
|------------------|------------------------|----------------------------------|
| `id`             | `string`               | UUID контакта                    |
| `userId`         | `string`               | UUID владельца записи            |
| `contactUserId`  | `string`               | UUID пользователя-контакта       |
| `displayName`    | `string \| null`       | Пользовательское имя контакта    |
| `status`         | `EContactStatus`       | Статус контакта                  |
| `createdAt`      | `Date`                 | Дата создания                    |
| `updatedAt`      | `Date`                 | Дата обновления                  |
| `contactProfile` | `PublicProfileDto?`    | Профиль контакта (если загружен) |

Статический метод `ContactDto.fromEntity(entity)` создает DTO из entity. Если у связанного `contactUser` загружен `profile`, он автоматически преобразуется в `PublicProfileDto`.

### IContactListDto

Интерфейс для пагинированного ответа: `IListResponseDto<ContactDto[]>`.

## События (Events)

### ContactRequestEvent

Эмитируется при добавлении нового контакта (`addContact`).

| Поле           | Тип          | Описание                          |
|----------------|--------------|-----------------------------------|
| `contact`      | `ContactDto` | DTO созданного контакта           |
| `targetUserId` | `string`     | UUID получателя запроса           |

### ContactAcceptedEvent

Эмитируется при принятии запроса контакта (`acceptContact`).

| Поле          | Тип          | Описание                              |
|---------------|--------------|---------------------------------------|
| `contact`     | `ContactDto` | DTO принятого контакта                |
| `requesterId` | `string`     | UUID инициатора (кто изначально добавил контакт) |

## Socket-интеграция

### ContactListener

Реализует `ISocketEventListener`. Зарегистрирован в модуле через `asSocketListener(ContactListener)`.

Слушает доменные события через `EventBus` и отправляет WebSocket-уведомления через `SocketEmitterService`:

| Доменное событие       | Socket-событие      | Получатель               | Payload      |
|------------------------|---------------------|--------------------------|--------------|
| `ContactRequestEvent`  | `contact:request`   | `targetUserId` (получатель запроса) | `ContactDto` |
| `ContactAcceptedEvent` | `contact:accepted`  | `requesterId` (инициатор)          | `ContactDto` |

Таким образом:
- Когда пользователь A добавляет пользователя B в контакты, пользователь B получает socket-уведомление `contact:request`
- Когда пользователь B принимает запрос, пользователь A получает socket-уведомление `contact:accepted`

## Зависимости

### Импортируемые модули и сервисы

- **User** (`src/modules/user/user.entity`) — entity `User` используется в связях `ManyToOne` в `Contact`
- **Profile** (`src/modules/profile/dto`) — `PublicProfileDto` используется в `ContactDto` для отображения профиля контакта
- **Socket** (`src/modules/socket`) — `asSocketListener`, `ISocketEventListener`, `SocketEmitterService` для WebSocket-интеграции
- **Core** (`src/core`) — `EventBus`, `Injectable`, `InjectableRepository`, `Module`, `ValidateBody`, `getContextUser`, `BaseRepository`, `BaseDto`, `IListResponseDto`

### Регистрация модуля

```typescript
@Module({
  providers: [
    ContactRepository,
    ContactService,
    ContactController,
    asSocketListener(ContactListener),
  ],
})
export class ContactModule {}
```

Модуль не импортирует другие модули через `imports` — все зависимости разрешаются через IoC-контейнер inversify.

## Взаимодействие с другими модулями

- **User** — каждый контакт ссылается на двух пользователей (`user` и `contactUser`). При удалении пользователя все его контакты каскадно удаляются (`onDelete: CASCADE`).
- **Profile** — при загрузке контактов подгружается `contactUser.profile`, который преобразуется в `PublicProfileDto` для отображения информации о контакте.
- **Socket** — `ContactListener` подписывается на доменные события и отправляет real-time уведомления целевым пользователям. Сервис не взаимодействует с сокетами напрямую, а использует паттерн EventBus для слабой связанности.

## Тесты

Модуль содержит два набора тестов:

- **`contact.service.test.ts`** — unit-тесты `ContactService` (14 тестов): покрывают все методы сервиса, включая позитивные сценарии и ошибки (BadRequest, Conflict, Forbidden, NotFound)
- **`validation/contact.validation.test.ts`** — unit-тесты Zod-схемы `CreateContactSchema` (5 тестов): валидный UUID, опциональное displayName, невалидный UUID, отсутствующий contactUserId, превышение длины displayName
