# Модуль File

Файлы пользователей: загрузка с проверкой типа, хранение через `FileStorage` (модуль storage), фоновая обработка медиа (webp, превью, blurhash, длительность, waveform), выдача подписанных ссылок, удаление. С диском и S3 напрямую модуль не работает — только с ключами хранилища.

## Структура

```
src/modules/file/
├── file.module.ts             # @Module: imports StorageModule, задачи, слушатель
├── file.entity.ts             # File (таблица files): ключи, статус, метаданные
├── file.types.ts              # EFileStatus, FileQueues, лимиты прямой загрузки
├── file.errors.ts             # FileError (FILE_*)
├── file-keys.ts               # Раскладка ключей: files/<id>/original.<ext>, <variant>.<ext>
├── file.repository.ts         # findPageByOwner, findStalePending, transitionStatus
├── file.service.ts            # Загрузка (multipart и прямая), список, удаление
├── file-url.service.ts        # FileUrlService: единственное место подписи ссылок (toDto, toDtoMap, buildWithFiles)
├── signed-files.ts            # TSignedFiles, TFileRef, NO_SIGNED_FILES, signedUrlOf, signedFileOf
├── file.controller.ts         # REST (tsoa)
├── file-process.job.ts        # FileProcessJob — очередь file.process
├── file-cleanup.job.ts        # FileCleanupJob — cron file.cleanup-pending
├── file-remove.job.ts         # FileRemoveJob — file.remove (удаление неиспользуемых по списку)
├── file-gc.job.ts             # FileGcJob — cron file.gc (сборка бесхозных без ссылок)
├── file-usage.checker.ts      # FileUsageChecker — сводка проб всех модулей
├── file.listener.ts           # события файла → file:uploaded/processed/deleted владельцу
├── media-processor.service.ts # sharp/ffmpeg на локальных файлах
├── ffmpeg.ts                  # Обёртка ffmpeg/ffprobe
├── file-upload.policy.ts      # Белый список, проверка сигнатуры (файл или начало объекта)
├── file-usage.probe.ts        # FILE_USAGE_PROBE / IFileUsageProbe / asFileUsageProbe
├── file.dto.ts                # IFileDto, ICreateUploadBody, IDirectUploadDto
├── validation/                # CreateUploadSchema
└── events/                    # FileUploadedEvent, FileProcessedEvent, FileDeletedEvent
```

## Entity `File` (таблица `files`)

| Поле                                         | Тип                                      | Описание                                                                       |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `id`                                         | `uuid` (PK)                              |                                                                                |
| `ownerId`                                    | `uuid`, nullable, FK → users SET NULL    | Загрузивший; `null` — файл отдан домену или владелец удалён; `IDX_FILES_OWNER` |
| `name` / `type`                              | `varchar(255)` / `varchar(127)`          | Исходное имя, MIME                                                             |
| `size`                                       | `bigint` (number в коде)                 | Размер оригинала, байт                                                         |
| `status`                                     | enum `EFileStatus`, по умолчанию `ready` | `pending` → `processing` → `ready` / `failed`; индекс `(status, created_at)`   |
| `key`                                        | `varchar(1024)`                          | Оригинал: `files/<id>/original.<ext>`                                          |
| `optimizedKey`                               | `varchar(1024)`, nullable                | `optimized.webp` (изображение) / `optimized.m4a` (аудио)                       |
| `thumbnailKey` / `mediumKey`                 | `varchar(1024)`, nullable                | Превью 200 / 800 px (webp; для видео — из первого кадра)                       |
| `width` / `height` / `blurhash` / `duration` | nullable                                 |                                                                                |
| `waveform`                                   | `simple-json`, nullable                  | 64 значения 0..1                                                               |
| `createdAt` / `updatedAt`                    | `timestamptz`                            |                                                                                |

Все объекты файла лежат под `files/<id>/` и удаляются `deletePrefix`. Оригинал хранится всегда (производные можно пересобрать).

Статусы: `pending` — прямая загрузка выдана, но не подтверждена (ссылки `null`); `processing` — оригинал доступен, производные готовятся; `ready`; `failed` — обработка не удалась после повторов, оригинал доступен. Документы сразу `ready`.

Связи: на файл ссылается `Profile.avatar` (SET NULL); модули со своими ссылками на файлы объявляют их сами и запрещают удаление занятого файла пробой использования.

У сущности нет ссылок и `toDTO()`: синхронной подписи нет, ссылки выдаёт только `FileUrlService`.

## Ссылки и DTO

`IFileDto` — id, ownerId, name, type, size, status, `url` (показ: оптимизированная версия или оригинал), `downloadUrl` (оригинал под исходным именем, `attachment`), `thumbnailUrl`, `mediumUrl`, blurhash, width, height, duration, waveform, createdAt, updatedAt. Ключи хранилища наружу не выходят.

Ссылки подписаны и живут `STORAGE_SIGNED_URL_TTL_SECONDS`: local — HMAC-ссылка на `/files/*` API, s3 — presigned URL хранилища (`FileStorage.signedGetUrl`). Подпись асинхронна, поэтому ссылки подписываются до сборки DTO, а не в конструкторе.

Единый API для всех модулей (экспортируется из `index.ts`):

| API                                                                             | Назначение                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `FileUrlService.toDto(file)` / `toDtos(files)`                                  | `IFileDto` с подписанными ссылками                                                                     |
| `FileUrlService.toDtoMap(files)`                                                | Карта `TSignedFiles` (`fileId → IFileDto`) пачкой: одна подпись на файл, повторы и `null` пропускаются |
| `FileUrlService.buildWithFiles(entities, collect, build)` / `buildOneWithFiles` | `collect` перечисляет файлы сущностей → одна карта → `build(entity, files)` собирает DTO               |
| `signedUrlOf(file, files)` / `signedFileOf(file, files)`                        | Ссылка / DTO файла из карты; нет файла или подписи — `null` / `undefined`                              |
| `NO_SIGNED_FILES`                                                               | Пустая карта (DTO без файлов)                                                                          |

Правило: DTO с аватарами и вложениями принимают карту `files: TSignedFiles` и берут ссылки только из неё. У каждого такого DTO рядом лежит `collect*Files(entities)` (`collectProfileFiles`, `collectUserFiles`, …). Файл не попал в карту — ссылка `null`.

## Endpoints

Базовый путь `/api/v1/file`, все — `@Security("jwt")`.

| Метод    | Путь                         | Ответ                         | Описание                                                                                      |
| -------- | ---------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `GET`    | `/`                          | 200 `IPaginatedDto<IFileDto>` | Свои файлы, новые первыми; `offset`, `limit` (≤ 100).                                         |
| `GET`    | `/{id}`                      | 200 `IFileDto`                | Метаданные и ссылки.                                                                          |
| `POST`   | `/`                          | 201 `IFileDto[]`              | Multipart (поле `file`, до 100 MB). Медиа — в статусе `processing`.                           |
| `POST`   | `/uploads`                   | 201 `IDirectUploadDto`        | Прямая загрузка: `{ name, size, contentType }` → `{ fileId, uploadUrl, headers, expiresAt }`. |
| `POST`   | `/uploads/{fileId}/complete` | 200 `IFileDto`                | Подтверждение прямой загрузки; идемпотентно.                                                  |
| `DELETE` | `/{id}`                      | 204                           | Владелец или суперпользователь; файл во вложении сообщения — 409.                             |

### Прямая загрузка крупных файлов (до 2 GiB)

1. `POST /uploads` — проверяются расширение и mime по белому списку; создаётся запись `pending`; ответ — ссылка на `PUT` с точным размером и типом (срок 1 час).
2. Клиент (или воркер) делает `PUT uploadUrl` с заголовками `headers`, тело — ровно `size` байт. Для local — маршрут `/files/*` модуля storage, для s3 — напрямую в хранилище.
3. `POST /uploads/{fileId}/complete` — объект существует (`FILE_UPLOAD_INCOMPLETE`), размер совпадает (`FILE_SIZE_MISMATCH`, объект удаляется), сигнатура по первым 64 KB совпадает с расширением (`FILE_SIGNATURE_MISMATCH`, запись и объект удаляются). Затем в одной транзакции статус `pending → processing|ready` (условным `UPDATE`: из двух параллельных `complete` задачу ставит один) и задача `file.process`.

Неподтверждённые за сутки загрузки удаляет `file.cleanup-pending`.

## Правила загрузки (multipart)

1. `multerOpts.fileFilter` — расширение из белого списка и согласованный mime (иначе 415). Лимиты: 100 MB на файл, 10 файлов, 20 частей, 64 KB на поле. Multer пишет во временный каталог ОС (`<tmp>/uploads`).
2. `FileService.uploadFile` — сигнатура (`file-type`) по временному файлу; текст (`txt`, `csv`) не должен быть бинарным. Иначе `FILE_SIGNATURE_MISMATCH` (415).
3. Оригинал — `FileStorage.put`, затем в одной транзакции запись и задача обработки (outbox через `manager`). Сбой — объекты хранилища удаляются. Временные файлы удаляются всегда.

Белый список: jpg/jpeg, png, gif, webp, heic/heif, mp4, mov, webm, mkv, mp3, m4a, ogg, opus, wav, aac, pdf, doc, xls, docx, xlsx, zip, rar, txt, csv.

Модуль добавляет свои форматы сам — `defineUploadRules({ ext: { mimes, signatures, inline } })`
в своём файле, экспортированном из `index.ts` (как `definePermissions`). `signatures`:
список типов `file-type`, `null` — текст, `"binary"` — бинарный формат без узнаваемой
сигнатуры (веса моделей: файл не должен распознаваться как другой тип). Базовые
расширения не переопределяются.

## Задачи

| Очередь                | Обработчик       | Политика                       | Что делает                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file.process`         | `FileProcessJob` | `retryLimit: 2`                | `withLocalFile(key)` → `MediaProcessorService.process` во временном каталоге → производные в хранилище → `processing → ready` + `FileProcessedEvent`. После последней попытки — `failed` + событие, `JobError("FILE_PROCESSING_FAILED", …, false)`. Файл удалён во время обработки — производные убираются. |
| `file.cleanup-pending` | `FileCleanupJob` | cron `0 * * * *`, без повторов | Удаляет `pending` старше суток (до 500 за запуск) вместе с объектами.                                                                                                                                                                                                                                       |
| `file.remove`          | `FileRemoveJob`  | `retryLimit: 5`                | `removeUnused(fileIds)`: удаляет из списка файлы без ссылок (пробы) — записи и объекты. Ставит `scheduleRemoval` в транзакции удаления домена (частями по 500).                                                                                                                                             |
| `file.gc`              | `FileGcJob`      | cron `15 4 * * *`              | Бесхозные (`ownerId = null`), не `pending`, старше часа — пачками по id; без ссылок удаляются. Собирает файлы, чьи ссылающиеся записи ушли каскадом (пространство, пользователь).                                                                                                                           |

Обработка: изображение — webp до 2048 px (с автоповоротом по EXIF), превью 200/800, blurhash; видео — ffprobe (размеры, длительность), превью из первого кадра (сбой кадра не фатален); аудио — m4a AAC 128k, длительность, waveform. Сбой blurhash/waveform не фатален.

## События

| Событие              | Данные                        | Когда                                         |
| -------------------- | ----------------------------- | --------------------------------------------- |
| `FileUploadedEvent`  | `fileId`, `userId`, `type`    | Оригинал сохранён (multipart или `complete`)  |
| `FileProcessedEvent` | `fileId`, `ownerId`, `status` | Обработка завершилась (`ready` / `failed`)    |
| `FileDeletedEvent`   | `fileId`, `ownerId`           | Файл удалён владельцем или суперпользователем |

Сокет — владельцу, из `FileListener`, чтобы списки на всех его устройствах совпадали:
`file:uploaded` (`IFileDto`), `file:processed` (`IFileDto`), `file:deleted` (`{ id }`).

## Ошибки (`FileError`, код `FILE_*`)

`NOT_FOUND` 404, `FORBIDDEN` 403, `IN_USE` 409, `TYPE_NOT_ALLOWED` 415, `SIGNATURE_MISMATCH` 415, `TOO_LARGE` 413, `UPLOAD_INCOMPLETE` 409, `SIZE_MISMATCH` 400.

## Владение и жизненный цикл файла

- Загруженный файл принадлежит загрузившему (`ownerId`): он видит его в своих файлах и
  может удалить.
- Модуль, который делает файл частью своих данных (кадр, модель), вызывает
  `FileService.adopt(fileIds, uploaderId, manager)` в транзакции, создающей ссылку:
  владелец снимается, файл живёт, пока на него ссылается запись модуля.
- Файлы, которые создаёт сам сервер: `createFromLocal({ path, name, type }, { ownerId?, manager? })`
  (распаковка архива) и `registerStored({ fileId, key, name, type }, …)` — объект уже загружен
  по подписанной ссылке (выход внешнего воркера); ключ заранее — `reserveFileKey(name)`.
- Удаление домена: `scheduleRemoval(fileIds, manager)` — задача `file.remove` в той же
  транзакции; она удалит только файлы, на которые к тому моменту никто не ссылается.
- Всё, что ушло каскадом (удалено пространство или пользователь), собирает `file.gc`.

## FILE_USAGE_PROBE

Модули, ссылающиеся на файлы, регистрируют `asFileUsageProbe(Cls)` с
`filesInUse(fileIds): Promise<string[]>` — пакетно. Используемый файл удалить вручную
нельзя (409), сборщик мусора его не трогает. В этой ветке — `ProfileAvatarUsageProbe` (аватар профиля),
`MessageFileUsageProbe` (вложения), `ChatAvatarUsageProbe`, `BotAvatarUsageProbe`.

## Зависимости

| Зависимость                             | Использование                                     |
| --------------------------------------- | ------------------------------------------------- |
| `FileStorage` (модуль storage)          | Оригиналы, производные, подписанные ссылки        |
| `JobQueue` (модуль jobs)                | `file.process`, `file.cleanup-pending`            |
| `SocketEmitterService`                  | `file:uploaded`, `file:processed`, `file:deleted` |
| `sharp`, `blurhash`, `ffmpeg`/`ffprobe` | Обработка медиа (на процессе-воркере)             |
| `file-type`                             | Сигнатуры (ESM-only, `await import`)              |
