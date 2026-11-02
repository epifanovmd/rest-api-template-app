---
module: common
summary: Общие утилиты без DI и домена — нормализация телефона, uuid, OTP, assertNotNull и безопасная работа с zip-архивами.
---

# common

Чистые функции, нужные нескольким модулям и не относящиеся к инфраструктуре ядра.
Без DI, без состояния, без знания о модулях.

## Public API

| Экспорт                                         | Что                                                           |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `normalizePhone`, `PHONE_RE`, `PHONE_INPUT_RE`  | телефон к виду `+7XXXXXXXXXX`; хранимый и принимаемый форматы |
| `isUuid`                                        | строка — UUID любой версии в каноническом виде                |
| `generateOtp(length = 6)`                       | цифровой код на `crypto.randomInt`                            |
| `assertNotNull(item, message \| HttpException)` | значение или исключение (по умолчанию 500)                    |
| `extractZip(options)`                           | распаковка zip по одной записи с лимитами                     |
| `createZip(entries, output)`                    | сборка zip потоком, открытых файлов не больше одного          |
| `isSafeEntryName`, `isServiceEntry`             | проверка имени записи архива                                  |
| `ArchiveError`, `TArchiveErrorCode`             | ошибка архива с кодом `ARCHIVE_*`                             |

## Устройство

- `helpers/` — мелкие функции; `normalizePhone` — единая нормализация для
  регистрации, входа и профиля: невалидное значение возвращается как есть, его
  отклоняет валидация.
- `archive/` — на `yauzl`/`yazl`. `extractZip` защищает от zip-бомб (число записей,
  сумма и размер распакованного, коэффициент сжатия, фактически прочитанные байты) и от
  path traversal; поток архива сначала пишется во временный файл (zip читается с
  конца). Каталоги, `__MACOSX`, dot-файлы и небезопасные имена пропускаются с причиной.
- `ArchiveError` — не `HttpException`: `common` не знает о HTTP, вызывающий модуль
  переводит код в свою доменную ошибку.

## Зависимости

`core/http` (`assertNotNull`), `crypto`, `yauzl`, `yazl`. Используют: телефон — auth,
passkeys, user; `generateOtp` — otp, user; `isUuid` —
`middleware/request-id.middleware.ts`. `archive/` и `assertNotNull` в шаблоне пока не
используются.

## Gotcha

- `generateOtp` даёт только цифры и может начинаться с нуля — хранить и сравнивать
  строкой, не числом.
