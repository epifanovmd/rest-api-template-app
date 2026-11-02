---
id: ops/codegen
title: Кодогенерация
summary: tsoa — маршруты и OpenAPI из декораторов (src/routing, коммитятся, CI сверяет); каркас модуля gen:module.
layer: project
roles: [developer, reviewer]
stages: [implementation, verification]
depends_on: [ops/commands]
---

# Кодогенерация

## tsoa: маршруты и OpenAPI

```sh
yarn generate        # tsoa spec-and-routes
```

- Вход — контроллеры `src/modules/**/*controller.ts` (`tsoa.json → controllerPathGlobs`).
- Выход — `src/routing/routes.ts` и `src/routing/swagger.json`. **Не редактируются
  вручную**, коммитятся вместе с изменением контроллеров.
- Запускается сам в `yarn dev`, `yarn build`; `yarn dev:routes` — перегенерация при
  изменении `src/modules`.
- `swagger.json` импортируется как JSON и попадает в сборку; Swagger UI — `/api-docs`,
  `servers` вычисляются на каждый запрос ([tech/http](../50-tech/http.md)).
- Схемы безопасности — `tsoa.json → securityDefinitions` (`jwt`, `apiKey`); новая
  схема — и там, и в реестре `SECURITY_SCHEME`.
- tsoa закреплён на 6.6.0 (`tsoa`, `@tsoa/runtime`, `@tsoa/cli`).
- JSDoc над методом контроллера становится summary/description операции.

CI (job `verify`): `yarn generate` и `git diff --exit-code -- src/routing` — незакоммиченная
или устаревшая генерация роняет сборку.

Страж спецификации — `src/routing/spec.test.ts`: `operationId` уникален (из него — имена
функций клиента), в телах запросов нет невыполнимых схем (`string & {}`), каждое
`permission:`-право в security объявлено через `definePermissions`.

## Каркас модуля

```sh
yarn gen:module <name>            # kebab-case, единственное число: invoice, order-item
yarn gen:module <name> --dry-run  # только список файлов
```

`scripts/gen-module.mjs` создаёт `src/modules/<name>/`: entity, repository, service,
controller, dto, validation (Zod), errors (`defineErrors`), events, module, README,
тесты сервиса и валидации. Регистрацию в `src/app.module.ts` (до `SocketModule`),
`yarn generate` и миграцию делает разработчик — скрипт печатает шаги.
