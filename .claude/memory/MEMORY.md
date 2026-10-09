# Memory Index

Общие принципы, архитектура и правила — в корневых документах (`ARCHITECTURE.md`,
`MODULE-CHEATSHEET.md`, `CONVENTIONS.md`, `CLEAN-CODE.md`, `DESIGN-PRINCIPLES.md`).
Здесь — проектная конкретика; обновлять свободно. Описывает ветку `main` (базовая платформа);
предметные примеры — в ветках-примерах этого шаблона (`example/*`).

## User

- [user_profile.md](user_profile.md) — профиль пользователя, язык, предпочтения

## Project — Architecture (факты)

- [project_architecture.md](project_architecture.md) — bootstrap order в `app.ts`, роли процесса `APP_ROLE`, реестры и точки расширения (токен → реализации в main), что живёт в Redis, контракты core (ошибки, пагинация, JobQueue, FileStorage), middleware, socket-инфраструктура, config-секции и `defineModuleConfig`, базовая миграция, тесты (юнит + e2e-стенд), Docker/compose/CI/deploy, HTTP-gotcha

## Project — Auth & Access Control

- [project_access_control.md](project_access_control.md) — JWT со scope, session-bound flow и отзыв, ротация refresh, 2FA, блокировка входа, политика пароля, схемы jwt/apiKey, роли и права (`definePermissions`), refresh-cookie, сокет-токен, аудит

## Project — Modules

- [project_modules.md](project_modules.md) — модель веток (main + example/*, базовая миграция не пересоздаётся), модули main и их сущности, эндпоинты по тегам, очереди задач (cron/external), сокет handlers/listeners/комнаты, бизнес-правила
- [project_reference.md](project_reference.md) — стек, карта README модулей, системные маршруты, Swagger `servers` на запрос, socket-события базы, enum-ы, env по группам

## Project — Эта ветка

- [Ветка example/messenger](project_example.md) — модули мессенджера: точки подключения к платформе, сокет-события, очереди, бизнес-правила, gotcha

## Project — Patterns (эталоны)

- [project_patterns.md](project_patterns.md) — эталоны main (в т.ч. «Агенты: проверенные gotcha») (gen:module, api-key, ошибки, пагинация, задачи/outbox/cron/external, хранилище, схемы auth, права, e2e), точки расширения для модулей веток (`*.socket-events.ts`, profile relations, `<feature>.config.ts`, письма, права), скелет теста, проектные gotcha

## Feedback

- [feedback_workflow.md](feedback_workflow.md) — анализ → план → мелкие итерации → проверка; багфикс через тест
