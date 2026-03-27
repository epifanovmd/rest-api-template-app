# Модуль Sticker

Модуль управления стикерами и наборами стикеров. Позволяет создавать наборы стикеров (sticker packs), добавлять/удалять стикеры в наборах, искать наборы, а также управлять персональной коллекцией наборов стикеров пользователя.

## Структура файлов

```
src/modules/sticker/
├── dto/
│   ├── sticker.dto.ts              # DTO для стикера и набора стикеров
│   └── index.ts                    # Реэкспорт DTO
├── validation/
│   ├── sticker.validate.ts         # Zod-схемы валидации входных данных
│   └── index.ts                    # Реэкспорт валидаций
├── sticker.entity.ts               # Entity стикера
├── sticker-pack.entity.ts          # Entity набора стикеров
├── user-sticker-pack.entity.ts     # Entity связи пользователь-набор (коллекция)
├── sticker.repository.ts           # Репозиторий стикеров
├── sticker-pack.repository.ts      # Репозиторий наборов стикеров
├── user-sticker-pack.repository.ts # Репозиторий коллекций пользователей
├── sticker.service.ts              # Бизнес-логика модуля
├── sticker.controller.ts           # REST-контроллер (tsoa)
├── sticker.module.ts               # Объявление модуля (IoC)
├── sticker.service.test.ts         # Юнит-тесты сервиса
└── index.ts                        # Публичный реэкспорт модуля
```

## Entity

### Sticker (таблица `stickers`)

Один стикер внутри набора.

| Поле        | Тип               | Описание                        |
|-------------|--------------------|---------------------------------|
| `id`        | `uuid` (PK)       | Уникальный идентификатор        |
| `packId`    | `uuid` (FK)       | ID набора стикеров              |
| `emoji`     | `varchar(10)` / `null` | Связанный эмодзи            |
| `fileId`    | `uuid` (FK)       | ID файла изображения стикера    |
| `position`  | `int`             | Порядковый номер в наборе       |
| `createdAt` | `timestamp`       | Дата создания                   |

**Связи:**
- `ManyToOne` -> `StickerPack` (поле `pack`, по `pack_id`, ON DELETE CASCADE)
- `ManyToOne` -> `File` (поле `file`, по `file_id`, ON DELETE CASCADE, eager: true)

### StickerPack (таблица `sticker_packs`)

Набор стикеров, созданный пользователем.

| Поле         | Тип               | Описание                            |
|--------------|--------------------|------------------------------------|
| `id`         | `uuid` (PK)       | Уникальный идентификатор            |
| `name`       | `varchar(100)`     | Уникальное системное имя набора     |
| `title`      | `varchar(200)`     | Отображаемое название набора        |
| `creatorId`  | `uuid` (FK)       | ID создателя                        |
| `isOfficial` | `boolean`         | Официальный набор (default: false)  |
| `isAnimated` | `boolean`         | Анимированные стикеры (default: false) |
| `createdAt`  | `timestamp`       | Дата создания                       |
| `updatedAt`  | `timestamp`       | Дата обновления                     |

**Связи:**
- `ManyToOne` -> `User` (поле `creator`, по `creator_id`, ON DELETE SET NULL)
- `OneToMany` -> `Sticker[]` (поле `stickers`, cascade: true, eager: true)

### UserStickerPack (таблица `user_sticker_packs`)

Связующая таблица: наборы стикеров, добавленные в коллекцию пользователя.

| Поле      | Тип          | Описание                          |
|-----------|--------------|-----------------------------------|
| `id`      | `uuid` (PK)  | Уникальный идентификатор          |
| `userId`  | `uuid` (FK)  | ID пользователя                   |
| `packId`  | `uuid` (FK)  | ID набора стикеров                |
| `addedAt` | `timestamp`  | Дата добавления (default: NOW)    |

**Уникальный индекс:** `IDX_USER_STICKER_PACKS_UNIQUE` по `(userId, packId)` -- один пользователь не может добавить один набор дважды.

**Связи:**
- `ManyToOne` -> `User` (поле `user`, по `user_id`, ON DELETE CASCADE)
- `ManyToOne` -> `StickerPack` (поле `pack`, по `pack_id`, ON DELETE CASCADE)

## Endpoints

Базовый путь: `/api/sticker`
Тег: `Sticker`

Все эндпоинты требуют JWT-аутентификации (`@Security("jwt")`). Дополнительных permission-ов не требуется.

| Метод    | Путь                         | Описание                                      | Тело запроса             | Ответ                |
|----------|------------------------------|-----------------------------------------------|--------------------------|----------------------|
| `POST`   | `/api/sticker/pack`          | Создать набор стикеров                        | `ICreateStickerPackBody` | `StickerPackDto`     |
| `GET`    | `/api/sticker/pack`          | Получить наборы текущего пользователя         | --                       | `StickerPackDto[]`   |
| `GET`    | `/api/sticker/pack/featured` | Получить рекомендуемые (официальные) наборы   | Query: `limit`, `offset` | `IStickerPackListDto` |
| `GET`    | `/api/sticker/pack/search`   | Поиск наборов по имени/заголовку              | Query: `q`, `limit`, `offset` | `IStickerPackListDto` |
| `GET`    | `/api/sticker/pack/{id}`     | Получить набор по ID                          | --                       | `StickerPackDto`     |
| `POST`   | `/api/sticker/pack/{id}/add` | Добавить набор в коллекцию пользователя       | --                       | `void`               |
| `DELETE` | `/api/sticker/pack/{id}/remove` | Удалить набор из коллекции пользователя    | --                       | `void`               |
| `POST`   | `/api/sticker/pack/{id}/sticker` | Добавить стикер в набор (только создатель) | `IAddStickerBody`        | `StickerPackDto`     |
| `DELETE` | `/api/sticker/{id}`          | Удалить стикер из набора (только создатель)   | --                       | `void`               |

## Сервис (StickerService)

Основная бизнес-логика модуля. Инжектирует три репозитория: `StickerPackRepository`, `StickerRepository`, `UserStickerPackRepository`.

### Методы

| Метод                    | Описание                                                                                  |
|--------------------------|-------------------------------------------------------------------------------------------|
| `createPack(userId, data)` | Создает набор. Проверяет уникальность `name`. Возвращает `StickerPackDto`.              |
| `addStickerToPack(packId, userId, data)` | Добавляет стикер в набор. Проверяет, что текущий пользователь -- создатель набора. Автоматически вычисляет `position` (max + 1). |
| `removeStickerFromPack(stickerId, userId)` | Удаляет стикер. Проверяет права создателя.                                 |
| `getPackById(packId)`    | Возвращает набор с загруженными стикерами и файлами. Бросает `NotFoundException`.         |
| `searchPacks(query, limit?, offset?)` | ILIKE-поиск по `name` и `title`. Пагинация, возвращает `{ data, totalCount }`. |
| `getFeaturedPacks(limit?, offset?)` | Возвращает официальные наборы (`isOfficial = true`) с пагинацией.                |
| `addPackToUser(userId, packId)` | Добавляет набор в коллекцию пользователя. Проверяет существование набора и отсутствие дубликата. |
| `removePackFromUser(userId, packId)` | Удаляет набор из коллекции пользователя. Бросает `NotFoundException` если не найден. |
| `getUserPacks(userId)`   | Возвращает все наборы из коллекции пользователя, отсортированные по дате добавления DESC. |

### Обработка ошибок

- `BadRequestException` -- дублирование имени набора, попытка повторного добавления набора в коллекцию
- `ForbiddenException` -- попытка добавить/удалить стикер не создателем набора
- `NotFoundException` -- набор или стикер не найден

## DTO

### StickerDto

| Поле        | Тип            | Описание                       |
|-------------|----------------|--------------------------------|
| `id`        | `string`       | UUID стикера                   |
| `packId`    | `string`       | UUID набора                    |
| `emoji`     | `string / null`| Связанный эмодзи               |
| `fileId`    | `string`       | UUID файла                     |
| `fileUrl`   | `string`       | URL файла изображения          |
| `position`  | `number`       | Позиция в наборе               |
| `createdAt` | `Date`         | Дата создания                  |

### StickerPackDto

| Поле         | Тип             | Описание                         |
|--------------|-----------------|----------------------------------|
| `id`         | `string`        | UUID набора                      |
| `name`       | `string`        | Системное имя                    |
| `title`      | `string`        | Отображаемое название            |
| `creatorId`  | `string`        | UUID создателя                   |
| `isOfficial` | `boolean`       | Официальный набор                |
| `isAnimated` | `boolean`       | Анимированный набор              |
| `stickers`   | `StickerDto[]`  | Стикеры (отсортированы по position) |
| `createdAt`  | `Date`          | Дата создания                    |
| `updatedAt`  | `Date`          | Дата обновления                  |

### Тела запросов

**ICreateStickerPackBody:**
| Поле         | Тип       | Обязательно | Валидация                                           |
|--------------|-----------|-------------|-----------------------------------------------------|
| `name`       | `string`  | Да          | 1-100 символов, только `[a-zA-Z0-9_-]`             |
| `title`      | `string`  | Да          | 1-200 символов                                      |
| `isAnimated` | `boolean` | Нет         | По умолчанию `false`                                |

**IAddStickerBody:**
| Поле     | Тип      | Обязательно | Валидация                    |
|----------|----------|-------------|------------------------------|
| `emoji`  | `string` | Нет         | Макс. 10 символов            |
| `fileId` | `string` | Да          | Валидный UUID                |

## Валидация

Zod-схемы в `validation/sticker.validate.ts`:

- **CreateStickerPackSchema** -- валидирует `name` (regex: латиница, цифры, `_`, `-`), `title`, `isAnimated`
- **AddStickerToPackSchema** -- валидирует `emoji` (опционально), `fileId` (uuid)

Валидация применяется через декоратор `@ValidateBody()` на контроллере.

## События (Events)

Модуль не генерирует доменных событий через `EventBus`.

## Socket-интеграция

Модуль не имеет socket-интеграции.

## Зависимости

### Импортируемые модули

Модуль не объявляет `imports` в `@Module` -- он самодостаточен на уровне IoC.

### Используемые entity из других модулей

- **User** (`src/modules/user/user.entity`) -- связь `creator` в `StickerPack`, связь `user` в `UserStickerPack`
- **File** (`src/modules/file/file.entity`) -- связь `file` в `Sticker` (изображение стикера)

### Зависимости из ядра

- `Injectable`, `InjectableRepository`, `Module` -- декораторы IoC
- `BaseRepository` -- базовый класс репозитория
- `BaseDto` -- базовый класс DTO
- `ValidateBody` -- декоратор валидации тела запроса
- `getContextUser` -- извлечение текущего пользователя из Koa-контекста

## Взаимодействие с другими модулями

- **Модуль User** -- `StickerPack.creator` и `UserStickerPack.user` ссылаются на `User`. При удалении пользователя: создатель набора устанавливается в NULL (`SET NULL`), записи коллекции удаляются каскадно (`CASCADE`).
- **Модуль File** -- `Sticker.file` ссылается на `File`. Стикер привязан к загруженному файлу. При удалении файла стикер удаляется каскадно (`CASCADE`). Файл загружается eager-загрузкой, URL файла маппится в `StickerDto.fileUrl`.

Модуль не экспортирует событий и не подписывается на события других модулей. Взаимодействие с другими модулями происходит исключительно через связи на уровне БД (foreign keys).

## Тесты

Файл `sticker.service.test.ts` содержит юнит-тесты для `StickerService` с использованием Mocha + Chai + Sinon. Покрыты все публичные методы сервиса, включая проверку прав доступа и обработку ошибок.
