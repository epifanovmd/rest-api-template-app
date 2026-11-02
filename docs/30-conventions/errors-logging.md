---
id: conventions/errors-logging
title: Ошибки и логирование
summary: defineErrors и коды <PREFIX>_<KEY>, запрет throw new Error и ! для null, пустой catch только с причиной, структурированный логгер вместо console, секреты не в логах.
layer: stack
roles: [developer, reviewer]
stages: [implementation, review]
depends_on: [architecture/errors, architecture/observability]
---

# Ошибки и логирование

Модель ошибок — [architecture/errors](../20-architecture/errors.md); контракт ответа
и статусы — [architecture/http](../20-architecture/http.md#контракт-ошибок).

## Ошибки

- Доменные ошибки модуля объявляются в `<feature>.errors.ts` одним вызовом
  `defineErrors("<PREFIX>", { KEY: { status, message } })` → код `<PREFIX>_<KEY>`;
  бросается `FeatureError.KEY(details?)`.
- Без доменного смысла — исключение из единого семейства; код выводится из статуса.
  `throw new Error` в бизнес-коде запрещён.
- Сообщения — на русском, без внутренних деталей.
- Обязательное наличие сущности проверяется явно с исключением; `!` для подавления
  `null` не используется.
- Ошибки не игнорируются молча; пустой `catch` допустим только с комментарием,
  почему это безопасно.

## Логирование

- Логирование — через структурированный логгер с объектом контекста первым
  аргументом; `console.*` запрещён (проверяется линтером).
- Секреты не пишутся в логи и не попадают в сообщения исключений.
