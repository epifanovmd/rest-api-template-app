# Модуль Contact

Модуль управления контактами пользователей. Реализует функциональность добавления, принятия, удаления и блокировки контактов с двусторонней связью между пользователями. При добавлении контакта создаются две записи: для инициатора (со статусом `ACCEPTED`) и для получателя (со статусом `PENDING`), что формирует систему запросов на добавление в контакты.

---

## Структура файлов

```
src/modules/contact/
├── contact.entity.ts                # TypeORM entity -- таблица contacts
├── contact.types.ts                 # Enum EContactStatus
├── contact.repository.ts            # Репозиторий с методами поиска
├── contact.service.ts               # Бизнес-логика контактов
├── contact.controller.ts            # REST-контроллер (tsoa)
├── contact.listener.ts              # Socket-слушатель доменных событий
├── contact.module.ts                # Декларация модуля @Module
├── index.ts                         # Реэкспорт всех публичных символов
├── dto/
│   ├── contact.dto.ts               # ContactDto + IContactListDto
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
│   ├── contact.validation.test.ts   # Unit-тесты валидации
│   └── index.ts
└── contact.service.test.ts          # Unit-тесты сервиса
```

---

## Entity

### Contact (`contacts`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `uuid` (PK) | Первичный ключ |
| `userId` | `uuid` | ID владельца записи контакта |
| `contactUserId` | `uuid` | ID пользователя-контакта |
| `displayName` | `varchar(80)`, nullable | Пользовательское имя контакта |
| `status` | `enum EContactStatus` | Статус: `pending`, `accepted`, `blocked` |
| `createdAt` | `timestamp` | Дата создания (автоматически) |
| `updatedAt` | `timestamp` | Дата обновления (автоматически) |

#### Связи

| Связь | Тип | Целевая entity | FK | onDelete |
|-------|-----|----------------|------|----------|
| `user` | `ManyToOne` | `User` | `user_id` | CASCADE |
| `contactUser` | `ManyToOne` | `User` | `contact_user_id` | CASCADE |

#### Индексы

- `IDX_CONTACTS_USER_CONTACT` -- уникальный индекс по `(userId, contactUserId)`, предотвращает дублирование контактов
- `IDX_CONTACTS_CONTACT_USER` -- индекс по `(contactUserId, userId)`, ускоряет обратный поиск

---

## Перечисления

### EContactStatus

| Значение | Описание |
|----------|----------|
| `pending` | Запрос на добавление ожидает подтверждения получателем |
| `accepted` | Контакт подтвержден |
| `blocked` | Контакт заблокирован владельцем записи |

---

## Endpoints

Базовый путь: `api/contact` | Тег Swagger: `Contact`

Все эндпоинты требуют JWT-аутентификации (`@Security("jwt")`). Дополнительных permission не требуется -- доступ ограничен только авторизованными пользователями; каждый пользователь работает исключительно со своими контактами.

| Метод | Путь | Описание | Валидация | Ответ |
|-------|------|----------|-----------|-------|
| `POST` | `/api/contact` | Добавить контакт | `CreateContactSchema` | `ContactDto` |
| `GET` | `/api/contact?status=` | Получить список контактов текущего пользователя | -- | `ContactDto[]` |
| `PATCH` | `/api/contact/{id}/accept` | Принять запрос на добавление в контакты | -- | `ContactDto` |
| `DELETE` | `/api/contact/{id}` | Удалить контакт (обе стороны связи) | -- | `string` (id) |
| `POST` | `/api/contact/{id}/block` | Заблокировать контакт | -- | `ContactDto` |

---

## Сервис (ContactService)

### Зависимости конструктора

- `ContactRepository` -- доступ к данным контактов
- `EventBus` -- публикация доменных событий
- `DataSource` -- TypeORM DataSource для транзакций

### Методы

#### `addContact(userId: string, contactUserId: string, displayName?: string): Promise<ContactDto>`

1. Проверяет, что пользователь не добавляет сам себя (`BadRequestException`)
2. Проверяет, не существует ли уже контакт (`ConflictException`) и не заблокирован ли (`ForbiddenException`)
3. Создает две записи в транзакции:
   - Для инициатора: `status = ACCEPTED`
   - Для получателя: `status = PENDING`
4. Эмитит `ContactRequestEvent` с `targetUserId` получателя
5. Возвращает `ContactDto` инициатора

#### `acceptContact(userId: string, contactId: string): Promise<ContactDto>`

1. Находит контакт, проверяет принадлежность текущему пользователю (`NotFoundException`)
2. Проверяет, что статус `PENDING` (`BadRequestException`)
3. Меняет статус на `ACCEPTED`
4. Эмитит `ContactAcceptedEvent` с `requesterId` (contactUserId -- ID инициатора)
5. Возвращает обновленный `ContactDto`

#### `removeContact(userId: string, contactId: string): Promise<string>`

1. Находит контакт, проверяет принадлежность (`NotFoundException`)
2. Удаляет обе стороны связи в транзакции (запись инициатора и запись получателя)
3. Эмитит `ContactRemovedEvent`
4. Возвращает `contactId`

#### `blockContact(userId: string, contactId: string): Promise<ContactDto>`

1. Находит контакт, проверяет принадлежность (`NotFoundException`)
2. Меняет статус на `BLOCKED`
3. Эмитит `ContactBlockedEvent` с `blockedUserId`
4. Возвращает обновленный `ContactDto`

#### `getContacts(userId: string, status?: EContactStatus): Promise<ContactDto[]>`

1. Загружает все контакты пользователя с relation `contactUser.profile`, опционально фильтруя по статусу
2. Возвращает массив `ContactDto`, отсортированных по `createdAt DESC`

---

## Репозиторий (ContactRepository)

Расширяет `BaseRepository<Contact>`.

| Метод | Сигнатура | Описание |
|-------|-----------|----------|
| `findByUserPair` | `(userId: string, contactUserId: string): Promise<Contact \| null>` | Находит контакт по паре userId + contactUserId с relation `contactUser.profile` |
| `findAllForUser` | `(userId: string, status?: EContactStatus): Promise<Contact[]>` | Все контакты пользователя с relation `contactUser.profile`, опциональный фильтр по статусу, сортировка `createdAt DESC` |
| `findById` | `(id: string): Promise<Contact \| null>` | Находит контакт по ID с relation `contactUser.profile` |

---

## DTO

### ContactDto

Создается через `ContactDto.fromEntity(entity)`.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `string` | UUID контакта |
| `userId` | `string` | UUID владельца записи |
| `contactUserId` | `string` | UUID пользователя-контакта |
| `displayName` | `string \| null` | Пользовательское имя контакта |
| `status` | `EContactStatus` | Статус контакта |
| `createdAt` | `Date` | Дата создания |
| `updatedAt` | `Date` | Дата обновления |
| `contactProfile` | `PublicProfileDto?` | Профиль контакта (если загружен через relation) |

Если у связанного `contactUser` загружен `profile`, он автоматически преобразуется в `PublicProfileDto`.

### IContactListDto

Интерфейс для пагинированного ответа: расширяет `IListResponseDto<ContactDto[]>`.

---

## Валидация (Zod-схемы)

### CreateContactSchema

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `contactUserId` | `string` | Обязательное, валидный UUID |
| `displayName` | `string`, optional | Макс. 80 символов |

---

## События (Events)

Все события передаются через `EventBus` (синхронный `emit`).

| Событие | Payload | Когда эмитируется |
|---------|---------|-------------------|
| `ContactRequestEvent` | `contact: ContactDto`, `targetUserId: string` | При добавлении нового контакта (`addContact`) |
| `ContactAcceptedEvent` | `contact: ContactDto`, `requesterId: string` | При принятии запроса контакта (`acceptContact`) |
| `ContactRemovedEvent` | `userId: string`, `contactUserId: string`, `contactId: string` | При удалении контакта (`removeContact`) |
| `ContactBlockedEvent` | `contact: ContactDto`, `blockedUserId: string` | При блокировке контакта (`blockContact`) |
| `ContactUnblockedEvent` | `contact: ContactDto`, `unblockedUserId: string` | При разблокировке контакта (определено в events, но не вызывается из сервиса в текущей реализации) |

---

## Socket-интеграция

### ContactListener

Реализует `ISocketEventListener`. Зарегистрирован в модуле через `asSocketListener(ContactListener)`.

Слушает доменные события через `EventBus` и отправляет WebSocket-уведомления через `SocketEmitterService`:

| Доменное событие | Socket-событие | Получатель | Payload |
|------------------|---------------|------------|---------|
| `ContactRequestEvent` | `contact:request` | `targetUserId` (получатель запроса, toUser) | `ContactDto` |
| `ContactAcceptedEvent` | `contact:accepted` | `requesterId` (инициатор, toUser) | `ContactDto` |
| `ContactRemovedEvent` | `contact:removed` | Обоим пользователям (`userId` и `contactUserId`, toUser) | `{ contactId }` |
| `ContactBlockedEvent` | `contact:blocked` | `blockedUserId` (заблокированному, toUser) | `ContactDto` |
| `ContactUnblockedEvent` | `contact:unblocked` | `unblockedUserId` (разблокированному, toUser) | `ContactDto` |

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

| Модуль | Что используется | Зачем |
|--------|-----------------|-------|
| **User** | `User` entity | Связи ManyToOne: `user` и `contactUser`. При удалении пользователя все его контакты каскадно удаляются (ON DELETE CASCADE) |
| **Profile** | `PublicProfileDto` | Используется в `ContactDto.contactProfile` для отображения профиля контакта |
| **Socket** | `asSocketListener`, `ISocketEventListener`, `SocketEmitterService` | WebSocket-интеграция для real-time уведомлений |
| **Core** | `EventBus`, `Injectable`, `InjectableRepository`, `Module`, `ValidateBody`, `getContextUser`, `BaseRepository`, `BaseDto`, `IListResponseDto` | DI, события, валидация, аутентификация |

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
