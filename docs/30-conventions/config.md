---
id: conventions/config
title: Конфигурация в коде
summary: Новая переменная — в схему, шаблон окружения и типизированный объект; process.env только в config.ts; настройки модуля через defineModuleConfig; ветвление по флагам.
layer: stack
roles: [developer, reviewer, devops]
stages: [implementation, review]
depends_on: [architecture/config]
---

# Конфигурация в коде

Модель конфигурации — [architecture/config](../20-architecture/config.md).

- Новая переменная окружения — в схему конфигурации, в шаблон файла окружения и в
  типизированный объект. Чтение `process.env` — только в `config.ts` и
  `<feature>.config.ts`.
- Настройка платформы — схема в `config.ts`; настройка модуля —
  `<feature>.config.ts` через `defineModuleConfig` (тип и значение по умолчанию,
  если оно допустимо).
- Ветвление по окружению — через флаги окружения из конфигурации; по роли процесса —
  через конфигурацию роли.
