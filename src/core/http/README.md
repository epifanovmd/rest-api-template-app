---
module: core/http
summary: HTTP-примитивы ядра — исключения с машинными кодами и defineErrors, тип UUID для путей, servers для Swagger, long-poll.
---

# http

Исключения, через которые модули сообщают об ошибках, и мелкие HTTP-утилиты.
Превращает исключения в ответ `middleware/error.middleware.ts`.

## Public API

| Экспорт                                          | Что                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `defineErrors(prefix, defs)`                     | фабрики доменных ошибок с кодами `<PREFIX>_<KEY>` + `.codes`                                             |
| `HttpException(message, status, reason?, code?)` | базовое исключение; `reason` уходит в `details` ответа                                                   |
| `BadRequest…ServiceUnavailableException`         | исключения по статусу (400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 500, 501, 503)                  |
| `ValidationException(fields)`                    | 400 `VALIDATION_ERROR`, `details`: поле → сообщение                                                      |
| `HttpStatus`, `defaultErrorCode(status)`         | статусы; код по статусу, если доменного нет (`NOT_FOUND`, `INTERNAL_ERROR`)                              |
| `UUID`                                           | тип path-id: tsoa проверяет формат `@pattern` до контроллера                                             |
| `HttpServer`                                     | `http.Server` как DI-токен (привязывает `App`)                                                           |
| `buildDocsServers`, `IDocsServer`                | `servers` спецификации на каждый запрос: origin, localhost, IP в сети, публичный URL, `API_DOCS_SERVERS` |
| `longPollSignal(req)`, `LONG_POLL_STATE`         | `AbortSignal` на закрытие соединения; логгер не считает запрос медленным                                 |

## Устройство

- Доменные ошибки модуля — `defineErrors("PREFIX", {...})` в `<feature>.errors.ts`;
  вызов фабрики возвращает `HttpException`, бросает вызывающий:
  `throw UserError.EMAIL_TAKEN()`. На `code` опирается клиент — коды стабильны.
- Неверный формат `UUID` в пути → tsoa `ValidateError` → 400 `VALIDATION_ERROR`
  (тот же контракт, что у Zod).

## Зависимости

Только `os` (для IP машины) и `types/koa.ts`. Используют все модули (`defineErrors`,
`UUID`, исключения), `core/auth`, `core/guards`, `core/decorators`, `common/helpers`,
`middleware`, `routing`.

## Gotcha

- JSDoc у `UUID` говорит о 422 — фактически ответ 400 (error middleware переводит
  `ValidateError`).
- Сообщение `HttpException` уходит клиенту как есть, в том числе для 5xx — не класть
  в него внутренние детали.
