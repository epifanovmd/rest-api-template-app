---
module: core/routing
summary: Точки расширения HTTP вне tsoa — провайдеры маршрутов Koa и сырые обработчики протоколов до разбора тела.
---

# routing

Реестры для HTTP, который не описывается контроллером tsoa: потоковая раздача
файлов, свои протоколы. Сами маршруты регистрирует `src/app.ts`.

## Public API

| Экспорт                               | Что                                                         |
| ------------------------------------- | ----------------------------------------------------------- |
| `ROUTE_PROVIDER`, `IRouteProvider`    | `register(router)` — свои маршруты на роутере `@koa/router` |
| `RAW_HTTP_HANDLER`, `IRawHttpHandler` | `handle(req, res)` → `true`, если запрос обслужен целиком   |
| `rawHttpMiddleware(getHandlers)`      | middleware опроса сырых обработчиков                        |

## Устройство

- Регистрация — `{ provide: ROUTE_PROVIDER, useClass }` / `{ provide: RAW_HTTP_HANDLER,
useClass }` в `@Module.providers`.
- `ROUTE_PROVIDER`: `App` вызывает `register` после tsoa-маршрутов, на том же
  роутере; маршруты проходят все middleware (helmet, CORS, лимит, bodyParser).
- `RAW_HTTP_HANDLER`: middleware стоит после системных маршрутов, но **до** helmet,
  CORS, лимита и bodyParser — обработчик сам читает тело и отвечает (`ctx.respond =
false`). Список берётся при каждом запросе, заполняется после загрузки модулей.
- Оба реестра опрашиваются только на ролях с HTTP API (не `worker`).

## Зависимости

Типы `koa`, `@koa/router`, `http`. Используют: `src/app.ts`; `ROUTE_PROVIDER` —
модуль storage (`/files/*`). `RAW_HTTP_HANDLER` в шаблоне никто не реализует.

## Gotcha

- Такие пути не попадают в Swagger и в тест покрытия спецификации — описывать их в
  README модуля.
- Для сырых обработчиков нет CORS и rate limit — защищать самостоятельно.
