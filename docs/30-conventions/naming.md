---
id: conventions/naming
title: Именование
summary: kebab-case директорий, суффиксы файлов по роли (entity, service, job, dto, validate, event…), стили имён в коде (классы, интерфейсы, enum, таблицы, права, очереди, маршруты), предметные имена.
layer: stack
roles: [developer, reviewer]
stages: [implementation, review]
depends_on: [architecture/module-layers]
---

# Именование

## Директории

Папки — в `kebab-case`, имя модуля — существительное предметной области или название
подсистемы. Состав модуля — [module-layers](../20-architecture/module-layers.md#анатомия-модуля).

## Файлы

| Содержимое                     | Соглашение                        | Пример                                    |
| ------------------------------ | --------------------------------- | ----------------------------------------- |
| Сущность ORM                   | `<name>.entity.ts`                | `<feature>.entity.ts`                     |
| Репозиторий                    | `<name>.repository.ts`            | `<feature>.repository.ts`                 |
| Сервис                         | `<name>.service.ts`               | `<feature>.service.ts`                    |
| Контроллер                     | `<name>.controller.ts`            | `<feature>.controller.ts`                 |
| Модуль                         | `<name>.module.ts`                | `<feature>.module.ts`                     |
| Enum-ы и константы домена      | `<name>.types.ts`                 | `<feature>.types.ts`                      |
| Доменные ошибки                | `<name>.errors.ts`                | `<feature>.errors.ts`                     |
| Права модуля                   | `<name>.permissions.ts`           | `<feature>.permissions.ts`                |
| Доступ к сущности с владельцем | `<name>.access.ts`                | `<feature>.access.ts`                     |
| Обработчик очереди задач       | `<aspect>.job.ts`                 | `<feature>-cleanup.job.ts`                |
| DTO                            | `dto/<name>.dto.ts`               | `dto/<feature>.dto.ts`                    |
| Схема валидации                | `validation/<action>.validate.ts` | `validation/create-<feature>.validate.ts` |
| Доменное событие               | `events/<name>.event.ts`          | `events/<feature>-created.event.ts`       |
| Обработчик реального времени   | `<name>.handler.ts`               | `<feature>.handler.ts`                    |
| Слушатель событий              | `<name>.listener.ts`              | `<feature>.listener.ts`                   |
| Bootstrapper                   | `<name>.bootstrap.ts`             | `<feature>.bootstrap.ts`                  |
| Middleware                     | `<name>.middleware.ts`            | `<purpose>.middleware.ts`                 |
| Guard                          | `<name>.guard.ts`                 | `<purpose>.guard.ts`                      |
| Тест                           | `<file>.test.ts` рядом с кодом    | `<feature>.service.test.ts`               |
| Public API                     | `index.ts`                        | `modules/<feature>/index.ts`              |

- Суффикс файла обязан совпадать с ролью класса внутри: в `*.service.ts` нет
  контроллеров, в `*.entity.ts` нет enum-ов.
- Имя не повторяет контекст: внутри модуля `feature` файл `dto/feature.dto.ts`, а не
  `dto/feature-module-feature.dto.ts`.

## Имена в коде

| Сущность                  | Стиль                                  | Пример                         |
| ------------------------- | -------------------------------------- | ------------------------------ |
| Класс                     | `PascalCase` + суффикс роли            | `FeatureService`, `FeatureDto` |
| Сущность ORM              | `PascalCase`, единственное число       | `Feature`                      |
| Таблица                   | `snake_case`, множественное число      | `features`                     |
| Колонка в БД              | `snake_case`                           | `created_at`                   |
| Поле сущности             | `camelCase`                            | `createdAt`                    |
| Индекс                    | `IDX_<TABLE>_<COLUMNS>`                | `IDX_FEATURES_USER`            |
| Интерфейс                 | `I` + `PascalCase`                     | `ICreateFeatureBody`           |
| Тип-алиас                 | `T` + `PascalCase`                     | `TPermission`                  |
| Enum                      | `E` + `PascalCase`, значения — строки  | `EFeatureStatus`               |
| Const-объект вместо enum  | `PascalCase`, `as const`               | `FeatureRoles`                 |
| Доменные ошибки           | `<Feature>Error`, код `<PREFIX>_<KEY>` | `FEATURE_NOT_FOUND`            |
| Права модуля              | `<Feature>Permissions`                 | `FeaturePermissions.MANAGE`    |
| Доступ «все / свои»       | `<Feature>Access`                      | `FeatureAccess.can(…)`         |
| Очередь задач             | `домен.действие` в kebab-case          | `feature.cleanup`              |
| Событие                   | `<Subject><PastParticiple>Event`       | `FeatureCreatedEvent`          |
| Схема валидации           | `<Action><Subject>Schema`              | `CreateFeatureSchema`          |
| DI-токен                  | `SCREAMING_SNAKE_CASE` Symbol          | `SOCKET_HANDLER`               |
| Приватное поле класса     | `_camelCase`                           | `_featureRepo`                 |
| Метод репозитория         | `find…`, `count…`, `exists…`           | `findByUserId`                 |
| Событие реального времени | `домен:действие` строкой               | `feature:created`              |
| Право                     | `домен:действие`, wildcard `домен:*`   | `feature:manage`               |
| Право «только свои»       | `домен:действие:own`                   | `feature:update:own`           |
| Маршрут                   | `api/v<N>/<feature>` в kebab-case      | `api/v1/feature-groups`        |
| Boolean                   | вопрос: `is`, `has`, `can`             | `isReady`, `hasAccess`         |

## Смысл имени

Имя выражает смысл в предметной области:

```ts
// Плохо
const data = await repo.find();

// Лучше
const activeMembers = await memberRepo.findActiveByChatId(chatId);
```

- функция и метод — глагол; коллекция — множественное число;
- `manager`, `helper`, `common`, `utils` — только если нельзя уточнить
  ответственность.
