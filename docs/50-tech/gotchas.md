---
id: tech/gotchas
title: Сквозные gotcha
summary: Неочевидное поведение tsoa, Zod, TypeORM, inversify, сокетов, конфигурации и тестов, не привязанное к одному модулю.
layer: project
roles: [developer, reviewer]
stages: [implementation, verification, review]
depends_on: []
---

# Сквозные gotcha

Gotcha одного модуля — в его README. Здесь — только сквозные.

## tsoa и контроллеры

- tsoa закреплён на 6.6.0. Деструктуризация в `@Body()` ломает генерацию — только
  `@Body() body: IXBody`; интерфейсы тел лежат в `dto/` и экспортируются из `dto/index.ts`.
- Типы с `string & {}` (`TRole`, `TPermission`) tsoa кодирует невыполнимой схемой —
  любой запрос отклоняется. В DTO запросов — `RoleName`/`PermissionName`; ловит
  `src/routing/spec.test.ts`.
- `@Path()` с uuid — тип `UUID` (`core/http/uuid.type.ts`): невалидный id отклоняется
  до контроллера → 400 `VALIDATION_ERROR`.
- `@ValidateQuery` подменяет query результатом парсинга: `offset`/`limit`/`cursor` и
  любые параметры обязаны быть в схеме. Булевы флаги в query — строки `"true"|"false"`
  (boolean ломает tsoa).
- Middleware tsoa создаётся без DI — сервисы брать из `iocContainer` (`src/app.container.ts`).
- void-эндпоинт — `@SuccessResponse(204)`, создание — 201.
- Изменение контроллера без `yarn generate` и коммита `src/routing` роняет CI.

## Ядро и DI

- inversify 8 — ESM-only, грузится из CJS через `require(esm)`; `ServiceIdentifier`
  вместо `interfaces.*`, в `toDynamicValue` — `ctx.get(...)`.
- Все биндинги — singleton; повторный bind класса пропускается. Забытый
  `@Injectable()` навешивается `ModuleLoader` сам.
- `SocketModule` — последним в `app.module.ts`: он multi-inject-ит handlers и listeners
  всех модулей.
- Новая схема аутентификации — и `asSecurityScheme`, и `tsoa.json →
securityDefinitions`; без реестра — 500 на маршруте.
- Глубокие импорты чужих модулей в сущностях и user/auth (`../user/user.entity`) —
  наследие; новый код — через `index.ts`. Исключение — `declare module` на
  файл-объявление.
- `Roles` и `TRole`/`TPermission` — только в модулях role/permission; в ядре роли и
  права — `string[]`.

## БД и данные

- TypeORM 1.x: `select` — только объектом (`{ id: true }`).
- Колонки `bigint` → number — трансформер `bigintNumber` (`core/db/transformers.ts`).
- `BaseDto` бросает 500, если entity `undefined`.
- `list.map(Dto.fromEntity)` с картой подписанных файлов вторым аргументом не
  компилируется — передавать карту явно.

## Конфигурация и пути

- Скомпилированный запуск без `NODE_ENV` — production со строгими проверками
  ([ops/environment](../70-ops/environment.md)).
- `.env*`, `STORAGE_LOCAL_PATH`, шаблоны писем — от корня проекта (`core/paths.ts`),
  не от cwd; одинаково в `src` и `build`.
- Origin сервера для Swagger — `${ctx.protocol}://${ctx.host}`: `ctx.origin` в Koa 3 —
  заголовок `Origin` клиента.
- `X-Forwarded-*` учитываются только при `TRUST_PROXY=true`.

## Сокеты

- Augmentation событий — только `declare module "../socket/socket.types"`; с `../socket`
  (index) не работает.
- Обработчики подписок регистрируются синхронно до первого `await` в `connection` —
  иначе `room:subscribe` сразу после connect теряется.
- Воркер не принимает клиентов, но слушатели EventBus на нём регистрируются: события
  задач уходят клиентам через Redis-адаптер.

## Задачи

- `expireInSeconds > 86400` отклоняется при регистрации обработчика (предел pg-boss).
- Периодическое — только `cron` в `definition`; `setInterval` — только инфраструктура
  процесса (монитор БД, heartbeat presence).

## Стиль кода

- Все функции — стрелочные (`func-style: expression`); хелпер объявляется выше
  первого использования.
