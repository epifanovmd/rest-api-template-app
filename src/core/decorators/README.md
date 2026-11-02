---
module: core/decorators
summary: Декораторы модульной системы и маршрутов — @Module, @Injectable, @InjectableRepository, Zod-валидация входа, @UseGuards.
---

# decorators

Декораторы, на которых держатся модули (метаданные для `ModuleLoader`) и маршруты
tsoa (валидация, гарды).

## Public API

| Экспорт                                                 | Что                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `Module(options)`                                       | метаданные модуля: `imports`, `entities`, `providers`, `bootstrappers` |
| `TokenProvider`, `ModuleProvider`, `isTokenProvider`    | провайдер: класс или `{ provide, useClass }` (multi-bind под токеном)  |
| `getModuleOptions`, `collectModules`, `collectEntities` | обход дерева модулей; сущности для `DataSource`                        |
| `Injectable()`                                          | = inversify `injectable()`, маркер                                     |
| `InjectableRepository(Entity)`                          | репозиторий TypeORM: сущность — в метаданных `repository:entity`       |
| `ValidateBody/Query/Params(schema)`                     | Zod-валидация входа маршрута; результат подменяет вход                 |
| `datesToIso`                                            | даты из схемы обратно в ISO-строки                                     |
| `UseGuards(...guards)`                                  | гарды `IGuard` (класс или экземпляр) как tsoa-middleware               |

## Устройство

- Регистрация в IoC — только `@Module.providers`; `@Injectable()` сам ничего не
  регистрирует. `ModuleLoader` (`core/module-loader.ts`) биндит всё
  `inSingletonScope()`, повторный bind класса пропускает, забытый `@Injectable()`
  навешивает сам.
- Репозиторий биндится через `toDynamicValue(new Repo(DataSource, entity))` — поэтому
  `@InjectableRepository`, а не `@Injectable`.
- Порядок загрузки — `collectModules`: импорты раньше импортёра, без дублей.
  Незарегистрированная в `entities` сущность не попадёт в `DataSource` — это ловит
  `core/db/entity-registry.test.ts`.
- `@ValidateBody` и др.: `safeParseAsync`; ошибки → `ValidationException`
  (400 `VALIDATION_ERROR`, `details`: путь → сообщение, `_` для корня). Даты
  (`z.coerce.date()`) возвращаются строками — дальше вход проверяет tsoa и сам
  отдаёт контроллеру `Date`.
- `UseGuards`: класс гарда создаётся заново на каждый запрос; `process` вернул
  `false` — `next()` не вызывается.

## Зависимости

`inversify`, `tsoa`, `zod`, `core/http` (`ValidationException`), `core/guards`
(`IGuard`), `core/bootstrap`. Используют все модули, `src/app.module.ts`,
`core/core.module.ts`, `core/module-loader.ts`, `core/db`.

## Gotcha

- tsoa-middleware (`@ValidateBody`, `@UseGuards`) выполняются после
  `@Security`, но вне DI: сервисы в них брать из `iocContainer` (`src/app.container.ts`).
- Деструктуризация в параметре `@Body()` ломает генерацию tsoa.
