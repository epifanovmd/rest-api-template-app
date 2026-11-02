---
module: core/logger
summary: Структурированный логгер pino с requestId из AsyncLocalStorage и маскированием секретов — единственный способ писать логи.
---

# logger

Логгер приложения. `console.*` в коде запрещён — только он.

## Public API

| Экспорт          | Что                                                                    |
| ---------------- | ---------------------------------------------------------------------- |
| `logger`         | экземпляр pino; API нативный (`logger.info({ ...поля }, "сообщение")`) |
| `LoggerService`  | injectable-обёртка: `log` — тот же экземпляр                           |
| `requestContext` | `AsyncLocalStorage<{ requestId }>`                                     |
| `getRequestId()` | текущий `requestId` или `undefined`                                    |

## Устройство

- Уровень — `LOG_LEVEL`; `pino-pretty` — только при `LOG_PRETTY`. В каждой записи
  `service` = `config.app.name`.
- `mixin` добавляет `requestId` в каждую запись внутри контекста. Контекст кладут
  `middleware/request-id.middleware.ts` (HTTP) и исполнитель задач модуля jobs
  (`job:<queue>:<id>`) — логи задачи связываются так же, как логи запроса.
- `redact`: поля `password`, `token`, `accessToken`, `refreshToken`, `code`, `otp`,
  `authorization` и др. — на глубине до 4 уровней заменяются на `[REDACTED]`.

## Зависимости

`config`, `core/decorators`. Используют все модули, `src/app.ts`, `src/main.ts`,
`middleware`, остальное ядро.

## Gotcha

- Маскируются только перечисленные имена полей и только до 4 уровней вложенности —
  секрет под другим именем попадёт в лог.
- Ошибку передавать полем `err` (`logger.error({ err }, …)`) — так pino сериализует
  stack.
