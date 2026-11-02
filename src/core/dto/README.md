---
module: core/dto
summary: Общие контракты ответов API — тело ошибки, пагинация offset/limit и курсорные ленты, базовый класс DTO.
---

# dto

Формы ответов, общие для всех модулей: на них опираются клиент и сгенерированная
спецификация.

## Public API

| Экспорт                                             | Что                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `IErrorResponseDto`                                 | тело ошибки: `status`, `code`, `message`, `details?`, `requestId?`, `stack?`    |
| `IPaginatedDto<T>`, `Pagination`                    | `{ items, total, offset, limit }`; нормализованные `offset`/`limit`             |
| `normalizePagination(offset, limit)`                | умолчание 20, максимум 100 (`PAGINATION_DEFAULT_LIMIT`, `PAGINATION_MAX_LIMIT`) |
| `toPage(items, total, pagination)`                  | сборка `IPaginatedDto`                                                          |
| `ICursorPageDto<T>`, `encodeCursor`, `decodeCursor` | лента `{ items, nextCursor }`; курсор — base64url от JSON                       |
| `BaseDto`                                           | базовый класс DTO: `undefined` вместо сущности — 500                            |
| `ApiResponseDto`, `IApiResponseDto`                 | устаревшая обёртка `{ message?, data? }`                                        |

## Устройство

- `normalizePagination` вызывается в каждом списке: без лимита запрос вернул бы всю
  таблицу. Невалидные значения не ошибка — подставляются умолчания.
- `decodeCursor` на мусорной строке возвращает `undefined` (лента с начала), а не 400.
- `IErrorResponseDto` заполняет `middleware/error.middleware.ts`; `stack` — только
  вне production, `requestId` — всегда.

## Зависимости

`core/http`, `core/logger`. Используют: `IErrorResponseDto` — все контроллеры
(`@Response<IErrorResponseDto>("default")`) и error middleware; пагинация — api-key,
file, passkeys, permission, profile, role, session, user; курсор — audit; `BaseDto` —
api-key, audit, passkeys, profile, session, user.

## Gotcha

- `ApiResponseDto` — легаси, остался в нескольких методах модуля auth; в новом коде
  не применять.
