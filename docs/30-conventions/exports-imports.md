---
id: conventions/exports-imports
title: Public API модуля и импорты
summary: Что реэкспортирует index.ts модуля, относительные пути внутри модуля, core и common через индексы, запрет глубоких импортов и циклов, import type.
layer: stack
roles: [developer, reviewer]
stages: [implementation, review]
depends_on: [architecture/dependencies, architecture/di]
---

# Public API модуля и импорты

Границы, которые эти правила обеспечивают, —
[architecture/dependencies](../20-architecture/dependencies.md). Регистрация
провайдеров — [architecture/di](../20-architecture/di.md).

## Public API

- `index.ts` реэкспортирует то, что нужно другим модулям, — и только это.
- Внутренние хелперы, приватные схемы и тестовые фабрики не экспортируются.
- Публичные типы экспортируются явно.

## Импорты

- Внутри модуля — относительные пути.
- `core` и `common` — через их публичные индексы.
- Чужой модуль — через его `index.ts`; глубокий импорт запрещён, кроме файла
  сущности `*.entity` для связей и репозиториев ORM.
- Импорты и экспорты сортируются автоматически; порядок групп задаёт линтер.
- Type-only зависимости — через `import type`, когда импорт не нужен в runtime.
- Циклы между модулями запрещены; цикл через barrel-файл — тоже цикл.
