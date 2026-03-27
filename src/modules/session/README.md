# Модуль Session

Модуль управления пользовательскими сессиями. Отвечает за хранение информации об активных сессиях (устройство, IP, user-agent), привязку refresh-токенов к сессиям и предоставление пользователю возможности просматривать и завершать свои сессии. При завершении сессий генерируются доменные события, транслируемые через Socket.IO.

---

## Структура файлов

```
src/modules/session/
├── index.ts                   # Реэкспорт всех публичных символов модуля
├── session.module.ts          # Декларация модуля (@Module)
├── session.entity.ts          # TypeORM-сущность Session (таблица sessions)
├── session.repository.ts      # Репозиторий с кастомными запросами
├── session.service.ts         # Бизнес-логика управления сессиями
├── session.controller.ts      # REST-контроллер (tsoa)
├── session.dto.ts             # DTO для ответа клиенту
├── session.listener.ts        # Socket-слушатель доменных событий
├── session.service.test.ts    # Unit-тесты сервиса (Mocha + Sinon + Chai)
└── events/
    ├── index.ts                   # Реэкспорт событий
    └── session-terminated.event.ts # Событие завершения сессии
```

---

## Entity: `Session`

Таблица: `sessions`

### Поля

| Поле            | Тип БД              | Описание                              | Ограничения                  |
|-----------------|----------------------|---------------------------------------|------------------------------|
| `id`            | `uuid` (PK)         | Уникальный идентификатор сессии       | Генерируется автоматически   |
| `userId`        | `uuid`               | ID пользователя-владельца сессии      | NOT NULL                     |
| `refreshToken`  | `varchar(500)`       | Refresh-токен, привязанный к сессии   | UNIQUE, NOT NULL             |
| `deviceName`    | `varchar(200)`       | Название устройства (например, "iPhone") | Nullable                  |
| `deviceType`    | `varchar(50)`        | Тип устройства (например, "mobile")   | Nullable                     |
| `ip`            | `varchar(45)`        | IP-адрес клиента                      | Nullable                     |
| `userAgent`     | `varchar(500)`       | User-Agent строка браузера/клиента    | Nullable                     |
| `lastActiveAt`  | `timestamp`          | Время последней активности            | DEFAULT CURRENT_TIMESTAMP    |
| `createdAt`     | `timestamp`          | Время создания сессии                 | Автозаполнение (CreateDateColumn) |

### Индексы

- `IDX_SESSIONS_USER` -- по полю `userId` (ускоряет выборку сессий пользователя)
- `IDX_SESSIONS_REFRESH_TOKEN` -- по полю `refreshToken`, **unique** (быстрый поиск сессии по токену)

### Связи

| Связь      | Тип       | Целевая сущность | Поле связи  | Поведение при удалении |
|------------|-----------|-------------------|-------------|------------------------|
| `user`     | ManyToOne | `User`            | `user_id`   | CASCADE                |

Связь однонаправленная: у `Session` есть ссылка на `User`, но у `User` нет обратной коллекции сессий. При удалении пользователя все его сессии удаляются каскадно.

---

## Endpoints (контроллер)

Базовый путь: `/api/session`
Тег Swagger: `Session`

| Метод    | Путь                          | Описание                                  | Security   | Возвращает        |
|----------|-------------------------------|-------------------------------------------|------------|-------------------|
| `GET`    | `/api/session`                | Получить список активных сессий текущего пользователя | `jwt`  | `SessionDto[]`    |
| `DELETE` | `/api/session/{id}`           | Завершить (удалить) конкретную сессию     | `jwt`      | `void`            |
| `POST`   | `/api/session/terminate-others` | Завершить все сессии, кроме текущей      | `jwt`      | `void`            |

### Подробности

- **GET /api/session** -- возвращает все сессии текущего авторизованного пользователя (определяется из JWT). Сессии отсортированы по `lastActiveAt` в порядке убывания (самые свежие первыми).

- **DELETE /api/session/{id}** -- удаляет сессию по её `id`. Проверяется, что сессия принадлежит текущему пользователю. Если сессия не найдена -- `NotFoundException (404)`. Если сессия принадлежит другому пользователю -- `ForbiddenException (403)`. После удаления эмитится `SessionTerminatedEvent`.

- **POST /api/session/terminate-others** -- завершает все сессии пользователя кроме текущей (текущая определяется по `sessionId` из JWT). Для каждой удалённой сессии эмитится `SessionTerminatedEvent`.

Все три эндпоинта требуют JWT-авторизацию (`@Security("jwt")`), без дополнительных permissions.

---

## Сервис: `SessionService`

Инжектируется через IoC как `SessionService`. Содержит всю бизнес-логику работы с сессиями.

### Зависимости

- `SessionRepository` -- доступ к БД
- `EventBus` -- отправка доменных событий

### Методы

| Метод                  | Параметры                                                      | Возвращает        | Описание                                                   |
|------------------------|----------------------------------------------------------------|-------------------|------------------------------------------------------------|
| `createSession`        | `{ userId, refreshToken, deviceName?, deviceType?, ip?, userAgent? }` | `SessionDto`  | Создает новую сессию в БД. Опциональные поля заполняются `null` если не переданы. |
| `getSessions`          | `userId: string`                                               | `SessionDto[]`    | Возвращает все сессии пользователя (сортировка по `lastActiveAt DESC`). |
| `terminateSession`     | `sessionId: string, userId: string`                            | `void`            | Удаляет конкретную сессию. Проверяет существование и владельца. Эмитит `SessionTerminatedEvent`. |
| `terminateAllOther`    | `userId: string, currentSessionId: string`                     | `void`            | Удаляет все сессии пользователя, кроме указанной (`Not(currentSessionId)`). Эмитит `SessionTerminatedEvent` для каждой удалённой сессии. |
| `terminateAllByUser`   | `userId: string`                                               | `void`            | Удаляет все сессии пользователя. Эмитит `SessionTerminatedEvent` для каждой удалённой сессии. Вызывается из `SessionListener` при смене пароля или изменении привилегий. |
| `findByRefreshToken`   | `refreshToken: string`                                         | `Session \| null` | Поиск сессии по refresh-токену. Используется при обновлении токенов. |
| `updateRefreshToken`   | `sessionId: string, newRefreshToken: string`                   | `void`            | Обновляет `refreshToken` и `lastActiveAt` для сессии.      |
| `updateLastActive`     | `sessionId: string`                                            | `void`            | Обновляет поле `lastActiveAt` на текущее время.            |

### Обработка ошибок

- `NotFoundException` -- сессия с указанным `id` не найдена (при `terminateSession`).
- `ForbiddenException` -- попытка удалить сессию, принадлежащую другому пользователю (при `terminateSession`).

---

## Репозиторий: `SessionRepository`

Наследуется от `BaseRepository<Session>`. Зарегистрирован через `@InjectableRepository(Session)`.

### Кастомные методы

| Метод                 | Параметры              | Возвращает          | Описание                                                    |
|-----------------------|------------------------|---------------------|-------------------------------------------------------------|
| `findByUserId`        | `userId: string`       | `Session[]`         | Все сессии пользователя, отсортированные по `lastActiveAt DESC` |
| `findByRefreshToken`  | `refreshToken: string` | `Session \| null`   | Поиск сессии по refresh-токену                              |

---

## DTO: `SessionDto`

Наследуется от `BaseDto`. Используется для отдачи данных о сессии клиенту. Не содержит `refreshToken` (чувствительное поле скрыто).

### Поля

| Поле           | Тип              | Описание                           |
|----------------|------------------|------------------------------------|
| `id`           | `string`         | UUID сессии                        |
| `userId`       | `string`         | UUID пользователя                  |
| `deviceName`   | `string \| null` | Название устройства                |
| `deviceType`   | `string \| null` | Тип устройства                     |
| `ip`           | `string \| null` | IP-адрес                           |
| `userAgent`    | `string \| null` | User-Agent строка                  |
| `lastActiveAt` | `Date`           | Время последней активности         |
| `createdAt`    | `Date`           | Время создания сессии              |

Статический метод `SessionDto.fromEntity(session)` конвертирует entity в DTO.

---

## События (Events)

### `SessionTerminatedEvent`

Файл: `events/session-terminated.event.ts`

Генерируется при завершении (удалении) сессии. Используется для уведомления клиента через Socket.IO.

| Поле        | Тип      | Описание                         |
|-------------|----------|----------------------------------|
| `sessionId` | `string` | UUID завершённой сессии          |
| `userId`    | `string` | UUID пользователя-владельца      |

Эмитится в методах:
- `SessionService.terminateSession()` -- одно событие
- `SessionService.terminateAllOther()` -- по одному событию на каждую удалённую сессию
- `SessionService.terminateAllByUser()` -- по одному событию на каждую удалённую сессию

---

## Socket-интеграция

### `SessionListener`

Файл: `session.listener.ts`

Реализует интерфейс `ISocketEventListener`. Зарегистрирован в модуле через `asSocketListener(SessionListener)`.

### Зависимости

- `EventBus` -- подписка на доменные события
- `SocketEmitterService` -- отправка socket-сообщений клиентам
- `SessionService` -- завершение сессий при внешних событиях

### Подписки на события

| Событие                     | Источник модуля | Действие                                                            |
|-----------------------------|-----------------|---------------------------------------------------------------------|
| `SessionTerminatedEvent`    | Session         | Отправляет socket-событие `session:terminated` пользователю с `{ sessionId }` |
| `PasswordChangedEvent`      | User            | Вызывает `SessionService.terminateAllByUser()` -- завершает все сессии пользователя |
| `UserPrivilegesChangedEvent`| User            | Вызывает `SessionService.terminateAllByUser()` -- завершает все сессии пользователя |

### Исходящие socket-события

| Событие              | Получатель            | Payload                  | Описание                                  |
|----------------------|-----------------------|--------------------------|-------------------------------------------|
| `session:terminated` | Конкретный пользователь (`toUser`) | `{ sessionId: string }` | Уведомление о завершении конкретной сессии |

---

## Зависимости

### Внутренние зависимости модуля

- `@force-dev/utils` -- исключения `ForbiddenException`, `NotFoundException`
- `inversify` -- DI-контейнер (`inject`)
- `tsoa` -- декораторы контроллера (`Route`, `Get`, `Delete`, `Post`, `Security`, `Tags`, `Request`, `Path`, `Controller`)
- `typeorm` -- ORM (`Entity`, `Column`, `ManyToOne`, `Not`, `Index`, `PrimaryGeneratedColumn`, `CreateDateColumn`, `JoinColumn`)
- `../../core` -- `Injectable`, `InjectableRepository`, `Module`, `getContextUser`, `EventBus`, `BaseDto`, `BaseRepository`
- `../socket` -- `asSocketListener`, `ISocketEventListener`, `SocketEmitterService`

### Связь с другими модулями

#### Зависит от:
- **User** -- `Session.user` ссылается на `User` entity через `ManyToOne` связь. Удаление пользователя каскадно удаляет все его сессии.
- **Socket** -- используется `SocketEmitterService` для отправки socket-событий и `asSocketListener` для регистрации слушателя.

#### Слушает события из:
- **User** -- `PasswordChangedEvent` (смена пароля) и `UserPrivilegesChangedEvent` (изменение ролей/разрешений) приводят к завершению всех сессий пользователя.

#### Потребители модуля:
Модуль экспортирует все свои символы через `index.ts` (`SessionService`, `SessionDto`, `Session`, `SessionRepository`, `SessionModule`), что позволяет другим модулям (например, модулю авторизации) использовать:
- `SessionService.createSession()` -- для создания сессии при логине
- `SessionService.findByRefreshToken()` -- для поиска сессии при обновлении токенов
- `SessionService.updateRefreshToken()` -- для ротации refresh-токена
- `SessionService.updateLastActive()` -- для обновления времени последней активности
- `SessionService.terminateAllByUser()` -- для принудительного завершения всех сессий

---

## Регистрация модуля

Файл: `session.module.ts`

```typescript
@Module({
  providers: [
    SessionRepository,
    SessionService,
    SessionController,
    asSocketListener(SessionListener),
  ],
})
export class SessionModule {}
```

Модуль не имеет импортов (`imports`). `SessionListener` регистрируется как socket-слушатель через хелпер `asSocketListener`, который привязывает его к токену `SOCKET_EVENT_LISTENER`.

---

## Тесты

Файл: `session.service.test.ts`

Unit-тесты покрывают методы `SessionService`:

- **createSession** -- создание сессии, обработка опциональных полей (заполнение `null`)
- **getSessions** -- получение списка сессий пользователя
- **terminateSession** -- успешное удаление, `NotFoundException` при отсутствии, `ForbiddenException` при чужой сессии
- **terminateAllOther** -- удаление всех сессий кроме текущей (проверка использования `Not()`)
- **findByRefreshToken** -- поиск по refresh-токену
- **updateLastActive** -- обновление времени активности

Используются: `Mocha`, `Sinon` (стабы репозитория и EventBus), `Chai` (assertions).
