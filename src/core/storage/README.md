---
module: core/storage
summary: Контракт файлового хранилища по ключам — FileStorage как DI-токен с подписанными ссылками; реализации в модуле storage.
---

# storage

Абстракция хранилища объектов: модули работают с ключами и подписанными ссылками,
не зная, диск это или S3. Реализации (диск, S3-совместимое) — модуль `modules/storage`.

## Public API

| Экспорт                | Что                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `FileStorage`          | абстрактный класс-токен: `put`, `get(key, range?)`, `stat`, `delete`, `deletePrefix`, `signedGetUrl`, `signedPutUrl`, `withLocalFile` |
| `StorageBody`          | тело записи: `Buffer`, поток или `{ path }` локального файла                                                                          |
| `PutOptions`           | `contentType`, `contentDisposition`                                                                                                   |
| `SignedUrlOptions`     | `ttlSeconds` (по умолчанию `STORAGE_SIGNED_URL_TTL_SECONDS`), `downloadName`                                                          |
| `StoredObject`         | `size`, `contentType?`, `etag?`, `lastModified?`                                                                                      |
| `STORAGE_ROUTE_PREFIX` | `/files` — путь раздачи и приёма по подписанным ссылкам                                                                               |

## Устройство

- Инжект — `@inject(FileStorage)`; привязку делает `StorageModule` по
  `STORAGE_DRIVER`.
- Раскладку ключей (`files/<id>.webp`, `exports/<id>/…`) определяет домен; ядро знает
  только ключи. `deletePrefix` удаляет «папку» сущности.
- `withLocalFile(key, fn)` — для инструментов, которым нужен путь (sharp, ffmpeg,
  архивы): для S3 — временная копия, удаляется после `fn`.
- `signedPutUrl` с `contentLength` — хранилище отклонит тело другого размера.

## Зависимости

Только тип `stream`. Реализует `modules/storage`; используют модуль file,
`src/multerOpts.ts`, `middleware/rate-limit.middleware.ts` (`/files/*` вне лимита).

## Gotcha

- Клиенту — только подписанные ссылки, и подписывать их пачкой до сборки DTO.
- Без `S3_PUBLIC_ENDPOINT` ссылка S3 строится на внутренний адрес хранилища —
  снаружи не откроется.
