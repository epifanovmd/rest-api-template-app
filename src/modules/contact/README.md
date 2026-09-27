# Модуль Contact

Модуль управления контактами пользователей. Реализует функциональность добавления, принятия, удаления и блокировки контактов с двусторонней связью между пользователями. При добавлении контакта создаются две записи: для инициатора (со статусом `ACCEPTED`) и для получателя (со статусом `PENDING`), что формирует систему запросов на добавление в контакты.

---

## Структура файлов

```
src/modules/contact/
├── contact.entity.ts                # TypeORM entity -- таблица contacts
├── contact.types.ts                 # Enum EContactStatus
├── contact.errors.ts                # ContactError: доменные коды CONTACT_*
├── contact.repository.ts            # Репозиторий с методами поиска
├── contact.service.ts               # Бизнес-логика контактов и блокировок
├── user-block.service.ts            # UserBlockService.isBlockedEither — проверка блокировок
├── contact.controller.ts            # REST-контроллер (tsoa)
├── contact.listener.ts              # Socket-слушатель доменных событий
├── contact.module.ts                # Декларация модуля @Module
├── index.ts                         # Реэкспорт всех публичных символов
├── dto/
│   ├── contact.dto.ts               # ContactDto
│   └── index.ts
├── events/
│   ├── contact-request.event.ts     # ContactRequestEvent
│   ├── contact-accepted.event.ts    # ContactAcceptedEvent
│   ├── contact-removed.event.ts     # ContactRemovedEvent
│   ├── contact-blocked.event.ts     # ContactBlockedEvent
│   ├── contact-unblocked.event.ts   # ContactUnblockedEvent
│   └── index.ts
├── validation/
│   ├── create-contact.validate.ts   # Zod-схема CreateContactSchema
│   ├── get-contacts.validate.ts     # Zod-схема GetContactsQuerySchema
│   ├── contact.validation.test.ts   # Unit-тесты валидации
│   └── index.ts
└── contact.service.test.ts          # Unit-тесты сервиса
```

---

## Entity

### Contact (`contacts`)

| Поле            | Тип                     | Описание                                 |
| --------------- | ----------------------- | ---------------------------------------- |
| `id`            | `uuid` (PK)             | Первичный ключ                           |
| `userId`        | `uuid`                  | ID владельца записи контакта             |
| `contactUserId` | `uuid`                  | ID пользователя-контакта                 |
| `displayName`   | `varchar(80)`, nullable | Пользовательское имя контакта            |
| `status`        | `enum EContactStatus`   | Статус: `pending`, `accepted`, `blocked` |
| `createdAt`     | `timestamp`             | Дата создания (автоматически)            |
| `updatedAt`     | `timestamp`             | Дата обновления (автоматически)          |

#### Связи

| Связь         | Тип         | Целевая entity | FK                | onDelete |
| ------------- | ----------- | -------------- | ----------------- | -------- |
| `user`        | `ManyToOne` | `User`         | `user_id`         | CASCADE  |
| `contactUser` | `ManyToOne` | `User`         | `contact_user_id` | CASCADE  |

#### Индексы

- `IDX_CONTACTS_USER_CONTACT` -- уникальный индекс по `(userId, contactUserId)`, предотвращает дублирование контактов
- `IDX_CONTACTS_CONTACT_USER` -- индекс по `(contactUserId, userId)`, ускоряет обратный поиск

---

## Перечисления

### EContactStatus

| Значение   | Описание                                               |
| ---------- | ------------------------------------------------------ |
| `pending`  | Запрос на добавление ожидает подтверждения получателем |
| `accepted` | Контакт подтвержден                                    |
| `blocked`  | Контакт заблокирован владельцем записи                 |

---

## Endpoints

Базовый путь: `api/v1/contact` | Тег Swagger: `Contact`

Все эндпоинты требуют `@Security("jwt")`; каждый пользователь работает только со своими
записями. Path-параметры — `UUID` (неверный формат → 422).

| Метод    | Путь                                     | Описание                                                                        | Валидация                | Ответ                       |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ | --------------------------- |
| `POST`   | `/api/v1/contact`                        | Добавить контакт                                                                | `CreateContactSchema`    | 201 `ContactDto`            |
| `GET`    | `/api/v1/contact?status=&offset=&limit=` | Контакты текущего пользователя постранично (`status=blocked` — заблокированные) | `GetContactsQuerySchema` | `IPaginatedDto<ContactDto>` |
| `PATCH`  | `/api/v1/contact/{id}/accept`            | Принять запрос                                                                  | --                       | `ContactDto`                |
| `DELETE` | `/api/v1/contact/{id}`                   | Удалить контакт                                                                 | --                       | 204                         |
| `POST`   | `/api/v1/contact/block/{userId}`         | Заблокировать пользователя (идемпотентно)                                       | --                       | 204                         |
| `DELETE` | `/api/v1/contact/block/{userId}`         | Снять блокировку                                                                | --                       | 204                         |

---

## Блокировки

Блокировка хранится как строка `contacts` блокирующего со статусом `BLOCKED` (создаётся,
если контакта не было). `UserBlockService.isBlockedEither(a, b)` — единая проверка
«кто-то из двоих заблокировал другого»; используется в contact (добавление контакта) и chat
(direct-чат, группы), доступна другим модулям (сообщения, звонки) через `index.ts`.

- Удаление контакта не удаляет встречную BLOCKED-строку: блокировку собеседника так не
  снять. Свою BLOCKED-строку удалить через `DELETE /{id}` нельзя (409) — только
  разблокировкой.
- Разблокировка удаляет BLOCKED-строку; контакт нужно добавить заново.

---

## Сервис (ContactService)

Зависимости: `ContactRepository`, `EventBus`, `DataSource`, `UserBlockService`.

| Метод                                             | Правила                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addContact(userId, contactUserId, displayName?)` | не себя (400); пользователь существует (404); нет блокировки ни в одну сторону (403); нет своей записи (409). В транзакции: запись инициатора `ACCEPTED`, запись получателя `PENDING` (если её ещё нет). `ContactRequestEvent`. |
| `acceptContact(userId, contactId)`                | своя запись в статусе `PENDING` → `ACCEPTED`. `ContactAcceptedEvent`.                                                                                                                                                           |
| `removeContact(userId, contactId)`                | своя запись (404), не `BLOCKED` (409). Удаляет свою запись и встречную, если та не `BLOCKED`. `ContactRemovedEvent`.                                                                                                            |
| `blockUser(userId, targetUserId)`                 | не себя (400); пользователь существует (404); уже заблокирован — без изменений. `ContactBlockedEvent`.                                                                                                                          |
| `unblockUser(userId, targetUserId)`               | нет блокировки — 404. Удаляет BLOCKED-строку. `ContactUnblockedEvent`.                                                                                                                                                          |
| `getContacts(userId, status?, offset?, limit?)`   | `status` из `EContactStatus` (иначе 400 `CONTACT_INVALID_STATUS`); страница `IPaginatedDto<ContactDto>` (`offset` 0, `limit` 20, максимум 100).                                                                                 |

---

## Репозиторий (ContactRepository)

Расширяет `BaseRepository<Contact>`.

| Метод            | Сигнатура                                                           | Описание                                                                                                         |
| ---------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `findByUserPair` | `(userId: string, contactUserId: string): Promise<Contact \| null>` | Находит контакт по паре userId + contactUserId с relation `contactUser.profile`                                  |
| `findAllForUser` | `(userId, status, offset, limit): Promise<[Contact[], number]>`     | Страница контактов с relation `contactUser.profile`, опциональный фильтр по статусу, сортировка `createdAt DESC` |
| `findById`       | `(id: string): Promise<Contact \| null>`                            | Находит контакт по ID с relation `contactUser.profile`                                                           |
| `userExists`     | `(userId: string): Promise<boolean>`                                | Существует ли пользователь                                                                                       |

---

## DTO

### ContactDto

Создается через `ContactDto.fromEntity(entity, files)`: `files` — карта подписей (`collectContactFiles(contacts)` + `FileUrlService`), из неё — `contactProfile.avatarUrl`. Репозиторий грузит `contactUser.profile.avatar`. В событиях `contact:*` DTO уже с подписанными ссылками.

| Поле             | Тип                 | Описание                                        |
| ---------------- | ------------------- | ----------------------------------------------- |
| `id`             | `string`            | UUID контакта                                   |
| `userId`         | `string`            | UUID владельца записи                           |
| `contactUserId`  | `string`            | UUID пользователя-контакта                      |
| `displayName`    | `string \| null`    | Пользовательское имя контакта                   |
| `status`         | `EContactStatus`    | Статус контакта                                 |
| `createdAt`      | `Date`              | Дата создания                                   |
| `updatedAt`      | `Date`              | Дата обновления                                 |
| `contactProfile` | `PublicProfileDto?` | Профиль контакта (если загружен через relation) |

Если у связанного `contactUser` загружен `profile`, он автоматически преобразуется в `PublicProfileDto`.

Список отдаётся как `IPaginatedDto<ContactDto>` (`items`, `total`, `offset`, `limit`).

---

## Ошибки (`contact.errors.ts`, коды `CONTACT_*`)

`NOT_FOUND` 404, `USER_NOT_FOUND` 404, `SELF` 400 (себя в контакты / заблокировать себя),
`BLOCKED` 403, `ALREADY_EXISTS` 409, `NOT_PENDING` 400, `REMOVE_BLOCKED` 409 (своя
BLOCKED-строка удаляется только разблокировкой), `NOT_BLOCKED` 404, `INVALID_STATUS` 400.

---

## Валидация (Zod-схемы)

### CreateContactSchema

| Поле            | Тип                | Ограничения                 |
| --------------- | ------------------ | --------------------------- |
| `contactUserId` | `string`           | Обязательное, валидный UUID |
| `displayName`   | `string`, optional | Макс. 80 символов           |

### GetContactsQuerySchema

| Поле     | Тип                        | Ограничения                                 |
| -------- | -------------------------- | ------------------------------------------- |
| `status` | `EContactStatus`, optional | `pending`, `accepted`, `blocked`            |
| `offset` | `number`, optional         | целое ≥ 0 (строка query приводится к числу) |
| `limit`  | `number`, optional         | целое 1..100                                |

Поля страницы обязаны быть в схеме: `ValidateQuery` подменяет query результатом
парсинга, и лишние ключи иначе отбрасываются.

---

## События (Events)

Все события передаются через `EventBus` (синхронный `emit`).

| Событие                 | Payload                                                        | Когда эмитируется                               |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| `ContactRequestEvent`   | `contact: ContactDto`, `targetUserId: string`                  | При добавлении нового контакта (`addContact`)   |
| `ContactAcceptedEvent`  | `contact: ContactDto`, `requesterId: string`                   | При принятии запроса контакта (`acceptContact`) |
| `ContactRemovedEvent`   | `userId: string`, `contactUserId: string`, `contactId: string` | При удалении контакта (`removeContact`)         |
| `ContactBlockedEvent`   | `contact: ContactDto`, `blockedUserId: string`                 | При блокировке пользователя (`blockUser`)       |
| `ContactUnblockedEvent` | `contact: ContactDto`, `unblockedUserId: string`               | При снятии блокировки (`unblockUser`)           |

---

## Socket-интеграция

### ContactListener

Реализует `ISocketEventListener`. Зарегистрирован в модуле через `asSocketListener(ContactListener)`.

Слушает доменные события через `EventBus` и отправляет WebSocket-уведомления через `SocketEmitterService`:

| Доменное событие        | Socket-событие      | Получатель                                               | Payload         |
| ----------------------- | ------------------- | -------------------------------------------------------- | --------------- |
| `ContactRequestEvent`   | `contact:request`   | `targetUserId` (получатель запроса, toUser)              | `ContactDto`    |
| `ContactAcceptedEvent`  | `contact:accepted`  | `requesterId` (инициатор, toUser)                        | `ContactDto`    |
| `ContactRemovedEvent`   | `contact:removed`   | Обоим пользователям (`userId` и `contactUserId`, toUser) | `{ contactId }` |
| `ContactBlockedEvent`   | `contact:blocked`   | `blockedUserId` (заблокированному, toUser)               | `ContactDto`    |
| `ContactUnblockedEvent` | `contact:unblocked` | `unblockedUserId` (разблокированному, toUser)            | `ContactDto`    |

Таким образом:

- Когда пользователь A добавляет пользователя B в контакты -- B получает socket-уведомление `contact:request`
- Когда пользователь B принимает запрос -- A получает socket-уведомление `contact:accepted`
- При удалении контакта -- оба пользователя получают `contact:removed`
- При блокировке -- заблокированный пользователь получает `contact:blocked`

---

## Регистрация модуля

```typescript
@Module({
  providers: [
    ContactRepository,
    ContactService,
    UserBlockService,
    ContactController,
    asSocketListener(ContactListener),
  ],
})
export class ContactModule {}
```

Модуль не импортирует другие модули через `imports` -- все зависимости разрешаются через IoC-контейнер inversify.

---

## Зависимости

### Внешние модули

| Модуль      | Что используется                                                                                                                                           | Зачем                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **User**    | `User` entity                                                                                                                                              | Связи ManyToOne: `user` и `contactUser`. При удалении пользователя все его контакты каскадно удаляются (ON DELETE CASCADE) |
| **Profile** | `PublicProfileDto`                                                                                                                                         | Используется в `ContactDto.contactProfile` для отображения профиля контакта                                                |
| **Socket**  | `asSocketListener`, `ISocketEventListener`, `SocketEmitterService`                                                                                         | WebSocket-интеграция для real-time уведомлений                                                                             |
| **Core**    | `EventBus`, `Injectable`, `InjectableRepository`, `Module`, `ValidateBody`, `getContextUser`, `BaseRepository`, `BaseDto`, `normalizePagination`, `toPage` | DI, события, валидация, аутентификация                                                                                     |

---

## Взаимодействие с другими модулями

```
 +--------------+  User entity relation   +--------------+
 |   Contact    | ----------------------> |    User      |
 |   Entity     |  user, contactUser      |   Module     |
 +--------------+                         +--------------+

 +--------------+  PublicProfileDto        +--------------+
 |   Contact    | ----------------------> |   Profile    |
 |   DTO        |  contactProfile         |   Module     |
 +--------------+                         +--------------+

 +--------------+                         +--------------+
 |   Contact    |  EventBus.emit()        |   Contact    |  toUser()
 |   Service    | ----------------------> |   Listener   | ---------->
 +--------------+                         +--------------+
                                                              +--------------+
                                                              |   Socket     |
                                                              |   Module     |
                                                              +--------------+
```

Сервис не взаимодействует с сокетами напрямую, а использует паттерн EventBus для слабой связанности.
