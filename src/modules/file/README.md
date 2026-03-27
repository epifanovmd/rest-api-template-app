# Модуль File

Модуль управления файлами. Обеспечивает загрузку, хранение, получение и удаление файлов на сервере. Для изображений автоматически генерируются миниатюры (thumbnail) с помощью библиотеки `sharp`.

## Структура файлов

```
src/modules/file/
├── file.entity.ts          # TypeORM entity — таблица files
├── file.repository.ts      # Репозиторий для работы с БД
├── file.service.ts         # Бизнес-логика: загрузка, получение, удаление
├── file.controller.ts      # REST-контроллер (tsoa)
├── file.dto.ts             # Интерфейс DTO для ответов API
├── file.module.ts          # Объявление модуля (IoC)
├── file.service.test.ts    # Unit-тесты сервиса
└── index.ts                # Re-export публичного API
```

## Entity — `File`

Таблица: `files`

### Поля

| Поле           | Тип БД             | TypeScript тип     | Описание                              |
|----------------|---------------------|---------------------|---------------------------------------|
| `id`           | `uuid` (PK)        | `string`            | Уникальный идентификатор (UUID v4)    |
| `name`         | `varchar(255)`      | `string`            | Оригинальное имя файла                |
| `type`         | `varchar(40)`       | `string`            | MIME-тип файла (`image/jpeg`, и т.д.) |
| `url`          | `varchar(120)`      | `string`            | Путь к файлу на сервере               |
| `size`         | `int`               | `number`            | Размер файла в байтах                 |
| `thumbnailUrl` | `varchar(120)`      | `string \| null`    | Путь к миниатюре (только для изображений) |
| `width`        | `int`               | `number \| null`    | Ширина изображения в пикселях         |
| `height`       | `int`               | `number \| null`    | Высота изображения в пикселях         |
| `createdAt`    | `timestamp`         | `Date`              | Дата создания записи                  |
| `updatedAt`    | `timestamp`         | `Date`              | Дата последнего обновления            |

### Связи с другими entity

| Связь          | Тип          | Связанная entity | Описание                                                        |
|----------------|--------------|------------------|-----------------------------------------------------------------|
| `avatarProfiles` | `OneToMany`  | `Profile`        | Профили, у которых данный файл установлен как аватар. Связь через `Profile.avatar` (колонка `avatar_id`). При удалении файла в профиле аватар устанавливается в `NULL` (`onDelete: "SET NULL"`). |

### Метод `toDTO()`

Entity содержит встроенный метод `toDTO()`, который возвращает плоский объект со всеми полями (без связей).

## Endpoints (контроллер `FileController`)

Базовый путь: `api/file`
Тег Swagger: `Files`

| Метод    | Путь           | Описание                      | Security  | Параметры                        | Ответ           |
|----------|----------------|-------------------------------|-----------|----------------------------------|-----------------|
| `GET`    | `/api/file`    | Получение файла по ID         | `jwt`     | Query: `id` (string) — ID файла | `IFileDto`      |
| `POST`   | `/api/file`    | Загрузка файла                | `jwt`     | Body: `file` (multipart file)    | `IFileDto[]`    |
| `DELETE` | `/api/file/{id}` | Удаление файла по ID        | `jwt`     | Path: `id` (string) — ID файла  | `boolean`       |

Все эндпоинты защищены JWT-аутентификацией (требуется авторизованный пользователь). Дополнительных permission не требуется.

## Сервис — `FileService`

### Методы

#### `getFileById(id: string): Promise<IFileDto>`
- Находит файл по ID через репозиторий.
- Если файл не найден, выбрасывает `NotFoundException`.
- Возвращает DTO файла.

#### `uploadFile(files: File[]): Promise<IFileDto[]>`
- Принимает массив файлов (tsoa `File` — результат multer).
- Для каждого файла:
  1. Генерирует UUID v4 в качестве ID.
  2. Если MIME-тип начинается с `image/`:
     - Извлекает метаданные изображения (`width`, `height`) через `sharp`.
     - Генерирует миниатюру 200x200 в формате WebP (качество 70%) с сохранением пропорций.
     - Сохраняет путь к миниатюре в `thumbnailUrl`.
  3. Сохраняет запись в БД через `FileRepository.createAndSave()`.
- Возвращает массив DTO созданных файлов.

#### `deleteFile(id: string): Promise<boolean>`
- Находит файл по ID. Если не найден — `NotFoundException`.
- Удаляет физический файл с диска через приватный метод `_deleteFileFromServer()`.
- Удаляет запись из БД.
- Возвращает `true` при успешном удалении.

#### `_deleteFileFromServer(url: string)` (приватный)
- Удаляет файл из директории, указанной в конфиге `config.server.filesFolderPath` (по умолчанию `./files`).
- Извлекает имя файла из URL и удаляет его через `fs.unlink`.

## DTO — `IFileDto`

Интерфейс ответа API:

```typescript
interface IFileDto {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}
```

> Примечание: поля `thumbnailUrl`, `width`, `height` присутствуют в entity и в `toDTO()`, но не объявлены в интерфейсе `IFileDto`. Фактически они возвращаются клиенту, но формально не типизированы в DTO.

## События (Events)

Модуль не генерирует доменных событий через `EventBus`.

## Socket-интеграция

Модуль не имеет Socket-интеграции.

## Зависимости

### Внешние библиотеки
- `sharp` — обработка изображений, генерация миниатюр
- `uuid` (v4) — генерация уникальных идентификаторов файлов
- `fs`, `path` — работа с файловой системой

### Зависимости из ядра
- `Injectable`, `InjectableRepository`, `BaseRepository` — IoC и базовый репозиторий
- `logger` — логирование ошибок
- `config` — конфигурация (`config.server.filesFolderPath`)
- `NotFoundException` — из `@force-dev/utils`

### Импортируемые модули
Модуль **не импортирует** другие feature-модули (`imports` в `@Module` отсутствует).

## Взаимодействие с другими модулями

### Profile
- Entity `Profile` имеет связь `ManyToOne` на `File` через поле `avatar` (колонка `avatar_id`).
- Файл может быть аватаром у нескольких профилей одновременно (`OneToMany`).
- При удалении файла аватар в профиле автоматически обнуляется (`onDelete: "SET NULL"`).

### AppModule
- `FileModule` зарегистрирован как провайдер в корневом `AppModule`.

### Multer
- Загрузка файлов на сервер осуществляется через multer-middleware (`src/multerOpts.ts`), который сохраняет файлы в директорию `config.server.filesFolderPath`.

## Тесты

Файл `file.service.test.ts` содержит unit-тесты для `FileService`:

- **getFileById** — возвращает DTO при существующем файле; выбрасывает `NotFoundException` при отсутствии.
- **uploadFile** — создает файловые entity для не-image файлов (без генерации миниатюр).
- **deleteFile** — удаляет из БД и возвращает `true`; выбрасывает `NotFoundException` при отсутствии файла.
