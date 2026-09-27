# Модуль Storage

Реализации контракта ядра `FileStorage` (`core/storage`) и раздача файлов по подписанным ссылкам. Модуль не знает о доменах: он работает только с ключами (`files/<id>/original.png`), раскладку ключей определяет модуль-владелец. Абсолютные пути и адреса хранилища наружу не отдаются.

## Структура

```
src/modules/storage/
├── storage.module.ts        # Привязка FileStorage по STORAGE_DRIVER, маршрут /files
├── local-file.storage.ts    # Драйвер local (диск)
├── s3-file.storage.ts       # Драйвер s3 (AWS S3, SeaweedFS, MinIO, Yandex, Selectel)
├── storage-url.signer.ts    # StorageUrlSigner: HMAC-ссылки GET/PUT
├── storage-signature.ts     # Вывод ключа, подпись и проверка query
├── storage-key.ts           # Проверка ключей, кодирование в путь URL
├── storage.routes.ts        # StorageRouteProvider: GET|HEAD|PUT /files/* (IRouteProvider)
├── send-stored-file.ts      # sendStoredFile(ctx, storage, key, options): Range, ETag, nosniff
├── http-range.ts            # Разбор заголовка Range
├── storage.errors.ts        # StorageError (STORAGE_*)
└── *.test.ts
```

## Драйверы

Выбор — `config.storage.driver` (`STORAGE_DRIVER`): `{ provide: FileStorage, useClass: LocalFileStorage | S3FileStorage }`. Потребители инжектят только токен: `@inject(FileStorage)`.

### local

- Объекты — файлы в `STORAGE_LOCAL_PATH`, метаданные (`contentType`, `contentDisposition`) — JSON в `<root>/.meta/<key>.json`.
- Запись атомарна: во временный файл `<root>/.tmp/<uuid>` (тот же том), затем `rename`; сбой потока не оставляет объекта.
- Ключ: относительный, из `/`-сегментов; пустые, `.`, `..`, скрытые (`.xxx`) сегменты, `\` и NUL запрещены — `STORAGE_INVALID_KEY`. Итоговый путь дополнительно проверяется на выход за корень.
- `get(key, range)` — поток файла с диапазоном; `withLocalFile` — путь к самому объекту без копии (только чтение).
- `deletePrefix("files/<id>/")` — папка целиком; префикс без `/` — все записи, чьё имя начинается с последнего сегмента. Пустой префикс запрещён.
- Ссылки — HMAC (см. ниже).

### s3

- `@aws-sdk/client-s3`, `forcePathStyle` для самостоятельно развёрнутых S3 (SeaweedFS, MinIO). Ссылки подписываются отдельным клиентом с `S3_PUBLIC_ENDPOINT` (публичный адрес хранилища), если API ходит в S3 по внутреннему адресу. Контрольные суммы запросов — только когда требуются (`WHEN_REQUIRED`): иначе SDK кладёт CRC пустого тела в presigned PUT, и прямая загрузка падает с `BadDigest`.
- `put` потока без известной длины пишет его во временный файл (`PutObject` требует `Content-Length`). Multipart для больших объектов — через `@aws-sdk/lib-storage` (пакета нет в зависимостях).
- `signedGetUrl` / `signedPutUrl` — presigned URL самого хранилища (`@aws-sdk/s3-request-presigner`), трафик мимо API. В PUT подписываются `Content-Type` и `Content-Length` (`contentLength`): тело другой длины хранилище отклонит.
- `withLocalFile` — временная копия, удаляется после вызова.

## Подписанные ссылки (HMAC)

Ключ подписи — `HMAC-SHA256(JWT_SECRET_KEY, "storage:signed-url:v1")`: секрет один, ключи разные. Подпись — `HMAC(ключ, метод \n key \n exp \n dl \n ct \n len)`, base64url.

- `GET {APP_PUBLIC_URL}/files/<key>?exp&sig[&dl]` — `dl` — скачать под именем.
- `PUT {APP_PUBLIC_URL}/files/<key>?exp&sig[&ct][&len]` — `ct` — обязательный `Content-Type`, `len` — точный размер.
- `exp` округляется вверх до 5 минут (при сроке от 10 минут): ссылки на один объект совпадают, и браузер берёт файл из кэша.
- Срок по умолчанию — `STORAGE_SIGNED_URL_TTL_SECONDS`.
- Маршрут `/files` не расходует глобальный лимит запросов: доступ ограничен подписью, а страницы грузят файлы сотнями.

Синхронной подписи по `config` нет: ссылки для DTO подписывает `FileUrlService` модуля file через `FileStorage.signedGetUrl`.

## Маршрут `/files/*` (вне tsoa, не в Swagger)

Регистрируется `StorageRouteProvider` под `ROUTE_PROVIDER`, без JWT — доступ даёт подпись.

| Метод      | Ответ                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET/HEAD` | 200 / 206 (`Range`, один диапазон) / 304 (`If-None-Match`) / 416 (`Content-Range: bytes */size`). `ETag`, `Last-Modified`, `Accept-Ranges`, `Cache-Control: private, max-age=<до истечения ссылки>`, `X-Content-Type-Options: nosniff`. Медиа (кроме SVG) — `inline`, остальное и `dl` — `attachment`. |
| `PUT`      | 204 + `ETag`. `Content-Type` должен совпасть с `ct` (415), тело — не больше `len` (413, в т. ч. при chunked), по итогу ровно `len` (400, объект удаляется). Без `len` — предел 5 GiB.                                                                                                                  |

Ошибки: неверная подпись — 403 `STORAGE_SIGNATURE_INVALID`, истёкшая — 403 `STORAGE_URL_EXPIRED`, плохой ключ (`..` и его кодировки) — 400 `STORAGE_INVALID_KEY`, нет объекта — 404 `STORAGE_NOT_FOUND`.

## sendStoredFile

`sendStoredFile(ctx, storage, key, { disposition: "inline" | "attachment" | "auto", fileName, cacheControl, contentType })` — раздача объекта из любого маршрута модуля, которому нужна своя авторизация (например, по JWT): Range/206/416, ETag/304, HEAD без чтения объекта, `nosniff`, `Content-Disposition` с `filename*`. Авторизацию проверяет вызывающий. По умолчанию `Cache-Control: private, max-age=0`.

## Ошибки (`StorageError`, код `STORAGE_*`)

`INVALID_KEY` 400, `NOT_FOUND` 404, `SIGNATURE_INVALID` 403, `URL_EXPIRED` 403, `RANGE_NOT_SATISFIABLE` 416, `TOO_LARGE` 413, `SIZE_MISMATCH` 400, `CONTENT_TYPE_MISMATCH` 415, `UNAVAILABLE` 503.

## Конфиг

| Переменная                       | Использование                               |
| -------------------------------- | ------------------------------------------- |
| `STORAGE_DRIVER`                 | `local` / `s3`                              |
| `STORAGE_LOCAL_PATH`             | Корень драйвера local                       |
| `STORAGE_SIGNED_URL_TTL_SECONDS` | Срок ссылок по умолчанию                    |
| `S3_*`                           | bucket, region, endpoint, ключи, path-style |
| `APP_PUBLIC_URL`                 | Адрес в HMAC-ссылках                        |
| `JWT_SECRET_KEY`                 | Источник ключа подписи (с доменной меткой)  |

## Тесты

- `local-file.storage.test.ts` — драйвер на временной папке: запись, атомарность, Range, выход за корень, `deletePrefix`.
- `storage-signature.test.ts` — просроченная, подделанная, чужая подпись; кодирование ключа.
- `storage.routes.test.ts` — настоящий Koa: 200/206/304/416, HEAD, `nosniff`, `attachment`, 403, `..`-обход, PUT с лимитами.
- `s3-file.storage.test.ts` — против S3-совместимого хранилища, только при `TEST_S3_ENDPOINT` (`TEST_S3_ACCESS_KEY_ID`, `TEST_S3_SECRET_ACCESS_KEY`, по умолчанию `storage`/`storage12345`):

```bash
docker run -d --name s3-test -p 59000:8333 -e AWS_ACCESS_KEY_ID=storage -e AWS_SECRET_ACCESS_KEY=storage12345 chrislusf/seaweedfs server -s3 -dir=/data -volume.max=0
TEST_S3_ENDPOINT=http://127.0.0.1:59000 yarn test:file src/modules/storage/s3-file.storage.test.ts
docker rm -f s3-test
```
